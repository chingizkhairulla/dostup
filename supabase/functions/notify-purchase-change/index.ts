import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60000) {
    return cachedAccessToken.token;
  }

  const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
  const privateKey = Deno.env.get("FCM_PRIVATE_KEY");

  if (!clientEmail || !privateKey) {
    throw new Error("FCM credentials not configured");
  }

  const parsedPrivateKey = privateKey.replace(/\\n/g, "\n");
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const base64urlEncode = (obj: object) => {
    const str = JSON.stringify(obj);
    const base64 = btoa(str);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const headerEncoded = base64urlEncode(header);
  const claimEncoded = base64urlEncode(claim);
  const signatureInput = `${headerEncoded}.${claimEncoded}`;

  const encoder = new TextEncoder();
  const signatureInputBytes = encoder.encode(signatureInput);

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = parsedPrivateKey
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureInputBytes
  );

  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${signatureInput}.${signatureBase64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Token exchange failed:", errorText);
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000)
  };

  return tokenData.access_token;
}

/**
 * Send FCM notification by user_id + role.
 * For creators (no user_id), pass userId=null to match by role only.
 */
async function sendFCMToUser(
  supabase: any,
  userId: string | null,
  userRole: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  if (!projectId) {
    console.error("FCM project ID not configured");
    return 0;
  }

  let query = supabase
    .from("push_tokens")
    .select("id, fcm_token")
    .eq("user_role", userRole);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: tokens, error } = await query;

  if (error || !tokens || tokens.length === 0) {
    console.log(`No tokens for userId=${userId} (${userRole})`);
    return 0;
  }

  const accessToken = await getAccessToken();
  let successCount = 0;

  for (const tokenRecord of tokens) {
    try {
      const message = {
        message: {
          token: tokenRecord.fcm_token,
          data: { title, body, ...(data || {}) },
          webpush: {
            fcm_options: { link: "/" }
          }
        }
      };

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(message)
        }
      );

      if (response.ok) {
        successCount++;
        console.log(`FCM sent to userId=${userId} (${userRole})`);
      } else {
        const errorData = await response.json();
        console.error("FCM error:", errorData);
        
        if (
          errorData.error?.code === 404 ||
          errorData.error?.details?.some((d: any) => 
            d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT"
          )
        ) {
          await supabase.from("push_tokens").delete().eq("id", tokenRecord.id);
        }
      }
    } catch (err) {
      console.error(`FCM exception:`, err);
    }
  }

  return successCount;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, record, old_record } = await req.json();
    
    console.log(`Purchase change: ${type}`, record || old_record);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (type === "INSERT" && record) {
      // Продавца уведомляем не при создании заказа, а когда покупатель прикрепит чек
      // (см. submit-payment-receipt). Здесь ничего не шлём.
      return new Response(
        JSON.stringify({ success: true, sent: 0, skipped: "insert" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "UPDATE" && record && old_record) {
      if (old_record.status === "pending" && record.status === "completed") {
        const purchaseId = record.id;
        const studentUserId = record.simple_user_id;

        const { data: purchase } = await supabase
          .from("simple_purchases")
          .select(`
            *,
            product:products(id, title)
          `)
          .eq("id", purchaseId)
          .single();

        // Notify student by user_id
        const title = "Доступ открыт!";
        const description = `Оплата за "${purchase?.product?.title || "продукт"}" подтверждена. Материалы и расписание уже доступны.`;

        const sent = await sendFCMToUser(
          supabase,
          studentUserId,
          "student",
          title,
          description,
          { type: "purchase_confirmed", purchaseId }
        );

        console.log(`Purchase confirmed: sent ${sent} notifications to student userId=${studentUserId}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Processed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-purchase-change:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});