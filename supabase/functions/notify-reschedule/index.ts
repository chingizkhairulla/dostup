import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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

async function sendFCMToUser(
  supabase: any,
  userId: string,
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

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("id, fcm_token")
    .eq("user_id", userId)
    .eq("user_role", userRole);

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
            fcm_options: { link: "/dashboard" }
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
          console.log(`Removed invalid token: ${tokenRecord.id}`);
        }
      }
    } catch (err) {
      console.error(`FCM exception for userId=${userId}:`, err);
    }
  }

  return successCount;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, record } = await req.json();
    
    console.log(`Reschedule notification: ${type}`, record);

    if (type !== "INSERT" || !record) {
      return new Response(
        JSON.stringify({ success: true, message: "No action needed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip if this reschedule was auto-created from approving a student's request
    // (notify-reschedule-response already sent a push)
    if (record.reasons?.includes("Запрос ученика подтверждён")) {
      console.log("Skipping: auto-created from approved student request");
      return new Response(
        JSON.stringify({ success: true, message: "Skipped (handled by response notification)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const studentUserId = record.simple_user_id;
    if (!studentUserId) {
      console.log("No student user ID in reschedule record");
      return new Response(
        JSON.stringify({ success: true, message: "No student to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let reasonText = "";
    if (record.comment) {
      reasonText = record.comment;
    } else if (record.reasons?.length > 0) {
      reasonText = record.reasons.join(", ");
    }

    const title = "Урок перенесён";
    let body = `Урок "${record.product_title}" перенесён с ${record.old_date} ${record.old_time?.slice(0, 5)} на ${record.new_date} ${record.new_time?.slice(0, 5)}`;
    
    if (reasonText) {
      body += `. Причина: ${reasonText}`;
    }

    const notificationData = {
      type: "reschedule",
      rescheduleId: record.id
    };

    const sent = await sendFCMToUser(
      supabase,
      studentUserId,
      "student",
      title,
      body,
      notificationData
    );

    console.log(`Reschedule notification: sent ${sent} to student ${studentUserId}`);

    return new Response(
      JSON.stringify({ success: true, sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-reschedule:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
