import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { localize, push, type Localized, type Push } from "../_shared/i18n.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deduplication: track processed booking IDs to prevent duplicate notifications
const processedBookings = new Map<string, number>();
const DEDUP_WINDOW_MS = 60000;

function isAlreadyProcessed(bookingId: string, eventType: string): boolean {
  const key = `${eventType}:${bookingId}`;
  const now = Date.now();
  const lastProcessed = processedBookings.get(key);
  
  if (lastProcessed && (now - lastProcessed) < DEDUP_WINDOW_MS) {
    console.log(`Dedup: skipping ${key}, processed ${now - lastProcessed}ms ago`);
    return true;
  }
  
  processedBookings.set(key, now);
  
  for (const [k, time] of processedBookings.entries()) {
    if (now - time > DEDUP_WINDOW_MS) {
      processedBookings.delete(k);
    }
  }
  
  return false;
}

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
 * Send FCM notification to a user by user_id and role.
 * For creators (no user_id), pass userId=null to match by role only.
 * Each device gets the message in the language it registered with.
 */
async function sendFCMToUser(
  supabase: any,
  userId: string | null,
  userRole: string,
  message: Localized<Push>,
  data?: Record<string, string>
): Promise<number> {
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  if (!projectId) {
    console.error("FCM project ID not configured");
    return 0;
  }

  let query = supabase
    .from("push_tokens")
    .select("id, fcm_token, language")
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
      const { title, body } = localize(message, tokenRecord.language);
      const fcmMessage = {
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
          body: JSON.stringify(fcmMessage)
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
    const { type, record, old_record } = await req.json();
    
    console.log(`Booking change: ${type}`, record || old_record);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (type === "INSERT" && record) {
      const bookingId = record.id;
      
      if (isAlreadyProcessed(bookingId, "INSERT")) {
        return new Response(
          JSON.stringify({ success: true, message: "Already processed (dedup)" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: booking, error: bookingError } = await supabase
        .from("simple_bookings")
        .select(`
          *,
          time_slot:time_slots(date, start_time),
          schedule:schedules(
            id, title, teacher_id,
            product:products(id, title, creator_id)
          ),
          user:simple_users(id, name, phone)
        `)
        .eq("id", bookingId)
        .single();

      if (bookingError || !booking) {
        console.error("Failed to fetch booking:", bookingError);
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const message = push.newBooking({
        student: booking.user?.name,
        product: booking.schedule?.product?.title,
        date: booking.time_slot?.date || "",
        time: booking.time_slot?.start_time || "",
      });

      const notificationData = {
        type: "booking",
        bookingId: bookingId
      };

      let totalSent = 0;

      // 1. Notify teacher if assigned — by user_id
      if (booking.schedule?.teacher_id) {
        const sent = await sendFCMToUser(
          supabase,
          booking.schedule.teacher_id,
          "teacher",
          message,
          notificationData
        );
        totalSent += sent;
      }

      // 2. Notify creator — no user_id, match by role only
      const sent = await sendFCMToUser(
        supabase,
        null,
        "creator",
        message,
        notificationData
      );
      totalSent += sent;

      console.log(`Booking INSERT: sent ${totalSent} notifications`);

      return new Response(
        JSON.stringify({ success: true, sent: totalSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "DELETE" && old_record) {
      const bookingId = old_record.id;
      
      if (isAlreadyProcessed(bookingId, "DELETE")) {
        return new Response(
          JSON.stringify({ success: true, message: "Already processed (dedup)" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: cancellation } = await supabase
        .from("booking_cancellations")
        .select("*")
        .eq("booking_id", bookingId)
        .single();

      if (!cancellation) {
        console.log("No cancellation record found for:", bookingId);
        return new Response(
          JSON.stringify({ success: true, message: "No cancellation record" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // The comment and the chosen reasons are the canceller's own words, so they
      // are passed through as written rather than translated.
      const note = cancellation.cancellation_comment
        ? `"${cancellation.cancellation_comment}"`
        : cancellation.cancellation_reasons?.length > 0
          ? cancellation.cancellation_reasons.join(", ")
          : undefined;
      const message = push.bookingCancelled({
        student: cancellation.user_name,
        product: cancellation.product_title,
        date: cancellation.slot_date,
        time: cancellation.slot_time,
        note,
      });

      const notificationData = {
        type: "cancellation",
        bookingId: bookingId,
        date: cancellation.slot_date,
        time: cancellation.slot_time
      };

      let totalSent = 0;

      // 1. Notify teacher if schedule has one — by user_id
      if (cancellation.schedule_id) {
        const { data: schedule } = await supabase
          .from("schedules")
          .select("teacher_id")
          .eq("id", cancellation.schedule_id)
          .single();

        if (schedule?.teacher_id) {
          const sent = await sendFCMToUser(
            supabase,
            schedule.teacher_id,
            "teacher",
            message,
            notificationData
          );
          totalSent += sent;
        }
      }

      // 2. Notify creator — by role only
      const sent = await sendFCMToUser(
        supabase,
        null,
        "creator",
        message,
        notificationData
      );
      totalSent += sent;

      // 3. Notify student if cancelled by creator/teacher
      if (cancellation.cancelled_by !== "student" && cancellation.simple_user_id) {
        const studentMessage = push.lessonCancelledByStaff({
          by: cancellation.cancelled_by === "teacher" ? "teacher" : "creator",
          product: cancellation.product_title,
          date: cancellation.slot_date,
          time: cancellation.slot_time,
        });
        
        const sentStudent = await sendFCMToUser(
          supabase,
          cancellation.simple_user_id,
          "student",
          studentMessage,
          { ...notificationData, type: "creator_cancellation" }
        );
        totalSent += sentStudent;
      }

      console.log(`Booking DELETE: sent ${totalSent} notifications`);

      return new Response(
        JSON.stringify({ success: true, sent: totalSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "No action needed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-booking-change:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});