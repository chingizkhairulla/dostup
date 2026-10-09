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
  if (!clientEmail || !privateKey) throw new Error("FCM credentials not configured");

  const parsedPrivateKey = privateKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600
  };

  const base64urlEncode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const signatureInput = `${base64urlEncode(header)}.${base64urlEncode(claim)}`;
  const pemContents = parsedPrivateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signatureInput));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${signatureInput}.${signatureBase64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  if (!tokenResponse.ok) throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  const tokenData = await tokenResponse.json();
  cachedAccessToken = { token: tokenData.access_token, expiresAt: Date.now() + (tokenData.expires_in * 1000) };
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, record } = await req.json();
    console.log(`Reschedule response notification: ${type}`, record);

    if (type !== "UPDATE" || !record) {
      return new Response(JSON.stringify({ success: true, message: "No action needed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const projectId = Deno.env.get("FCM_PROJECT_ID");
    if (!projectId) {
      console.error("FCM project ID not configured");
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const requestedBy = record.requested_by || "student";
    const isApproved = record.status === "approved";

    let title: string;
    let body: string;
    let targetUserId: string | null = null;
    let targetRole: string;
    let targetLink: string;

    if (requestedBy === "student") {
      // Student's request was responded to → notify the student
      targetUserId = record.simple_user_id;
      targetRole = "student";
      targetLink = "/dashboard";

      title = isApproved ? "Перенос подтверждён ✅" : "Перенос отклонён ❌";
      body = isApproved
        ? `Урок "${record.product_title}" перенесён на ${record.new_date} ${record.new_time?.slice(0, 5)}`
        : `Запрос на перенос "${record.product_title}" отклонён`;

    } else {
      // Creator/Teacher's request was responded to by student → notify creator/teacher
      if (record.teacher_id) {
        targetUserId = record.teacher_id;
        targetRole = "teacher";
        targetLink = "/teacher";
      } else {
        targetUserId = null;
        targetRole = "creator";
        targetLink = "/creator";
      }

      // Get student name
      let studentName = "Ученик";
      if (record.simple_user_id) {
        const { data: studentData } = await supabase
          .from("simple_users")
          .select("name")
          .eq("id", record.simple_user_id)
          .single();
        if (studentData) studentName = studentData.name;
      }

      title = isApproved ? "Перенос подтверждён учеником ✅" : "Перенос отклонён учеником ❌";
      body = isApproved
        ? `${studentName} подтвердил перенос "${record.product_title}" на ${record.new_date} ${record.new_time?.slice(0, 5)}`
        : `${studentName} отклонил запрос на перенос "${record.product_title}"`;
    }

    if (record.response_comment) {
      body += `. ${record.response_comment}`;
    }

    if (!targetUserId && targetRole !== "creator") {
      return new Response(JSON.stringify({ success: true, message: "No target to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const query = supabase.from("push_tokens").select("id, fcm_token").eq("user_role", targetRole);
    if (targetUserId) query.eq("user_id", targetUserId);
    const { data: tokens } = await query;

    if (!tokens?.length) {
      console.log(`No tokens for ${targetRole} ${targetUserId || "all"}`);
      return new Response(JSON.stringify({ success: true, sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = await getAccessToken();
    let sent = 0;

    for (const tokenRecord of tokens) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: tokenRecord.fcm_token,
                data: { title, body, type: "reschedule_response", rescheduleRequestId: record.id, status: record.status },
                webpush: {
                  fcm_options: { link: targetLink }
                }
              }
            })
          }
        );
        if (response.ok) { sent++; }
        else {
          const errorData = await response.json();
          console.error("FCM error:", errorData);
          if (errorData.error?.code === 404 || errorData.error?.details?.some((d: any) =>
            d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT"
          )) {
            await supabase.from("push_tokens").delete().eq("id", tokenRecord.id);
          }
        }
      } catch (err) { console.error("FCM exception:", err); }
    }

    console.log(`Reschedule response: sent ${sent} to ${targetRole} ${targetUserId || "all"}`);
    return new Response(JSON.stringify({ success: true, sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-reschedule-response:", error);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
