import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

// In-memory dedup to prevent double cron invocations
let lastRunTimestamp = 0;
const MIN_RUN_INTERVAL_MS = 30000; // 30 seconds

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Dedup: prevent double cron invocation within 30s
    const now = Date.now();
    if (now - lastRunTimestamp < MIN_RUN_INTERVAL_MS) {
      console.log("Skipping duplicate cron invocation");
      return new Response(
        JSON.stringify({ message: "Skipped (dedup)", unlocked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    lastRunTimestamp = now;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Atomically find AND clear available_at in one step to prevent race conditions
    // First fetch materials to unlock
    const { data: materialsToUnlock, error: fetchError } = await supabase
      .from("materials")
      .select("id, product_id, title")
      .not("available_at", "is", null)
      .lte("available_at", new Date().toISOString());

    if (fetchError) {
      console.error("Error fetching materials to unlock:", fetchError);
      throw fetchError;
    }

    if (!materialsToUnlock || materialsToUnlock.length === 0) {
      return new Response(
        JSON.stringify({ message: "No materials to unlock", unlocked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const materialIds = materialsToUnlock.map(m => m.id);

    // Atomically unlock — if a parallel invocation already cleared available_at,
    // this update will affect 0 rows (no harm done)
    const { error: updateError } = await supabase
      .from("materials")
      .update({ available_at: null })
      .in("id", materialIds)
      .not("available_at", "is", null); // Only update rows still locked

    if (updateError) {
      console.error("Error unlocking materials:", updateError);
      throw updateError;
    }

    console.log(`Unlocked ${materialsToUnlock.length} materials`);

    // Get unique product IDs and fetch product titles
    const productIds = [...new Set(materialsToUnlock.map(m => m.product_id))];
    const { data: products } = await supabase
      .from("products")
      .select("id, title")
      .in("id", productIds);

    const productTitleMap: Record<string, string> = {};
    (products || []).forEach((p: any) => { productTitleMap[p.id] = p.title; });

    // Insert into material_unlocks log table for realtime notifications
    const unlockRecords = materialsToUnlock.map(m => ({
      material_id: m.id,
      product_id: m.product_id,
      material_title: m.title,
      product_title: productTitleMap[m.product_id] || "Продукт",
    }));

    const { error: insertError } = await supabase
      .from("material_unlocks")
      .insert(unlockRecords);

    if (insertError) {
      console.error("Error inserting material_unlocks:", insertError);
    } else {
      console.log(`Inserted ${unlockRecords.length} material_unlock records`);
    }

    // Send push notifications — one per student per product (deduplicated)
    const sentKeys = new Set<string>();

    for (const productId of productIds) {
      const materialsForProduct = materialsToUnlock.filter(m => m.product_id === productId);

      // Get all students who purchased this product
      const { data: purchases } = await supabase
        .from("simple_purchases")
        .select("simple_user_id")
        .eq("product_id", productId)
        .in("status", ["completed", "confirmed"]);

      if (!purchases || purchases.length === 0) continue;

      const studentIds = [...new Set(purchases.map(p => p.simple_user_id))];

      const title = "Новый материал доступен! 📚";
      const body = materialsForProduct.length === 1
        ? `Материал "${materialsForProduct[0].title}" теперь доступен в "${productTitleMap[productId] || "продукте"}"`
        : `${materialsForProduct.length} новых материала доступны в "${productTitleMap[productId] || "продукте"}"`;

      for (const studentId of studentIds) {
        // Dedup key: studentId + productId
        const key = `${studentId}:${productId}`;
        if (sentKeys.has(key)) continue;
        sentKeys.add(key);

        // Get tokens by user_id
        const { data: tokens } = await supabase
          .from("push_tokens")
          .select("id, fcm_token")
          .eq("user_id", studentId)
          .eq("user_role", "student");

        if (!tokens || tokens.length === 0) {
          console.log(`No push tokens for student ${studentId}`);
          continue;
        }

        // Send FCM directly to avoid double-hop dedup issues
        const projectId = Deno.env.get("FCM_PROJECT_ID");
        const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
        const privateKey = Deno.env.get("FCM_PRIVATE_KEY");

        if (!projectId || !clientEmail || !privateKey) {
          console.error("FCM credentials not configured");
          continue;
        }

        const accessToken = await getAccessToken(clientEmail, privateKey);

        for (const tokenRecord of tokens) {
          try {
            const message = {
              message: {
                token: tokenRecord.fcm_token,
                notification: { title, body },
                data: { type: "material_unlocked", productId },
                webpush: {
                  notification: {
                    icon: "/icon-192.png",
                    badge: "/icon-192.png",
                    tag: `material_unlock_${productId}`,
                    requireInteraction: true
                  },
                  fcm_options: { link: "https://dostup.lovable.app/dashboard" }
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
              console.log(`FCM sent to student ${studentId} for product ${productId}`);
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
            console.error(`FCM exception for student ${studentId}:`, err);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Materials unlocked", unlocked: materialsToUnlock.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in unlock-materials:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- FCM Auth helpers ---
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60000) {
    return cachedAccessToken.token;
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
  const pemContents = parsedPrivateKey.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInputBytes);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${signatureInput}.${signatureBase64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000)
  };

  return tokenData.access_token;
}
