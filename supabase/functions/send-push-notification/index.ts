import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

// Cache for access token
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

// Deduplication cache
const sentNotifications = new Map<string, number>();
const DEDUP_WINDOW_MS = 60000;

function getNotificationKey(identifier: string, title: string, data?: Record<string, string>): string {
  const bookingId = data?.bookingId || "";
  const purchaseId = data?.purchaseId || "";
  const productId = data?.productId || "";
  const messageId = data?.messageId || "";
  const topicId = data?.topicId || "";
  const reportId = data?.reportId || "";
  const type = data?.type || "";
  return `${identifier}:${type}:${bookingId}:${purchaseId}:${productId}:${messageId}:${topicId}:${reportId}:${title}`;
}

function isDuplicate(key: string): boolean {
  const lastSent = sentNotifications.get(key);
  if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) {
    return true;
  }
  return false;
}

function markAsSent(key: string): void {
  sentNotifications.set(key, Date.now());
  if (sentNotifications.size > 100) {
    const now = Date.now();
    for (const [k, v] of sentNotifications.entries()) {
      if (now - v > DEDUP_WINDOW_MS) {
        sentNotifications.delete(k);
      }
    }
  }
}

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

async function sendFCMNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  if (!projectId) {
    return { success: false, error: "FCM project ID not configured" };
  }

  try {
    const accessToken = await getAccessToken();

    const message = {
      message: {
        token: fcmToken,
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

    if (!response.ok) {
      const errorData = await response.json();
      console.error("FCM send error:", errorData);
      
      if (
        errorData.error?.code === 404 ||
        errorData.error?.details?.some((d: any) => 
          d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT"
        )
      ) {
        return { success: false, error: "INVALID_TOKEN" };
      }
      
      return { success: false, error: errorData.error?.message || "FCM send failed" };
    }

    const result = await response.json();
    console.log("FCM send success:", result.name);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("FCM send exception:", error);
    return { success: false, error: errorMessage };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check: only allow service_role calls (from DB triggers) ---
    const authHeader = req.headers.get("Authorization") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!authHeader.includes(serviceRoleKey)) {
      console.warn("Unauthorized call to send-push-notification: missing service_role key");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, title, body, data, targetRole } = await req.json();

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For creators, userId may be null — use targetRole to identify
    const identifier = userId || `role:${targetRole || 'unknown'}`;

    // Check for duplicate notifications
    const dedupKey = getNotificationKey(identifier, title, data);
    if (isDuplicate(dedupKey)) {
      console.log(`Duplicate notification blocked: ${dedupKey}`);
      return new Response(
        JSON.stringify({ message: "Duplicate notification blocked", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    markAsSent(dedupKey);

    console.log(`Sending push notification to ${identifier} (role: ${targetRole || 'any'}): ${title}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("push_tokens")
      .select("id, fcm_token, user_role");

    if (userId) {
      query = query.eq("user_id", userId);
    } else {
      // Creator tokens have user_id = NULL
      query = query.is("user_id", null);
    }
    
    if (targetRole) {
      query = query.eq("user_role", targetRole);
    }

    const { data: tokens, error: tokensError } = await query;

    if (tokensError) {
      console.error("Error fetching tokens:", tokensError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log(`No push tokens found for user: ${identifier} with role: ${targetRole || 'any'}`);
      return new Response(
        JSON.stringify({ message: "No tokens registered", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${tokens.length} tokens for user ${identifier}`);

    const results = await Promise.all(
      tokens.map(async (tokenRecord) => {
        const result = await sendFCMNotification(
          tokenRecord.fcm_token,
          title,
          body,
          data
        );

        if (!result.success && result.error === "INVALID_TOKEN") {
          console.log(`Removing invalid token: ${tokenRecord.id}`);
          await supabase
            .from("push_tokens")
            .delete()
            .eq("id", tokenRecord.id);
        }

        return result;
      })
    );

    const successCount = results.filter(r => r.success).length;
    console.log(`Push notifications sent: ${successCount}/${tokens.length}`);

    return new Response(
      JSON.stringify({ 
        message: "Notifications processed",
        sent: successCount,
        total: tokens.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-push-notification:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
