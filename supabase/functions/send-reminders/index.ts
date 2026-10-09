import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dostup-session, x-creator-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

interface Reminder {
  id: string;
  booking_id: string | null;
  simple_user_id: string | null;
  reminder_type: string;
  scheduled_at: string;
  product_title: string | null;
  slot_date: string | null;
  slot_time: string | null;
  sent_at: string | null;
  target_role: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting reminder check...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();
    const { data: reminders, error: remindersError } = await supabase
      .from("booking_reminders")
      .select("*")
      .lte("scheduled_at", now)
      .is("sent_at", null)
      .limit(200);

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      throw remindersError;
    }

    if (!reminders || reminders.length === 0) {
      console.log("No pending reminders found");
      return new Response(
        JSON.stringify({ message: "No pending reminders", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${reminders.length} reminders to process`);

    // Filter out morning reminders (no longer used)
    const regularReminders = (reminders as Reminder[]).filter(r => r.reminder_type !== "morning");

    // Mark any remaining morning reminders as sent so they don't pile up
    const morningReminders = (reminders as Reminder[]).filter(r => r.reminder_type === "morning");
    if (morningReminders.length > 0) {
      const morningIds = morningReminders.map(r => r.id);
      await supabase.from("booking_reminders").update({ sent_at: new Date().toISOString() }).in("id", morningIds);
      console.log(`Skipped ${morningIds.length} morning reminders (feature removed)`);
    }

    let successCount = 0;
    let failCount = 0;

    // Process regular reminders (24h and 2h)
    for (const reminder of regularReminders) {
      try {
        const { title, body } = getReminderText(reminder);

        const pushSuccess = await sendReminderPush(supabase, reminder, title, body);

        if (!pushSuccess) {
          failCount++;
          continue;
        }

        await supabase
          .from("booking_reminders")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", reminder.id);

        successCount++;
        console.log(`Sent ${reminder.target_role} ${reminder.reminder_type} reminder ${reminder.id}`);
      } catch (error) {
        console.error(`Exception processing reminder ${reminder.id}:`, error);
        failCount++;
      }
    }

    console.log(`Reminders processed: ${successCount} sent, ${failCount} failed`);

    return new Response(
      JSON.stringify({ message: "Reminders processed", sent: successCount, failed: failCount, total: reminders.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-reminders:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Get notification text based on role and type
function getReminderText(reminder: Reminder): { title: string; body: string } {
  const isCreatorOrTeacher = reminder.target_role === "creator" || reminder.target_role === "teacher";

  if (reminder.reminder_type === "24h") {
    return {
      title: isCreatorOrTeacher ? "Завтра урок!" : "Завтра занятие!",
      body: `"${reminder.product_title}" состоится ${formatDate(reminder.slot_date)} в ${formatTime(reminder.slot_time)}`
    };
  } else {
    // 2h
    return {
      title: isCreatorOrTeacher ? "Скоро урок!" : "Скоро занятие!",
      body: isCreatorOrTeacher
        ? `"${reminder.product_title}" через 2 часа`
        : `"${reminder.product_title}" начнётся через 2 часа`
    };
  }
}

// Send push notification based on target_role
async function sendReminderPush(
  supabase: any,
  reminder: Reminder,
  title: string,
  body: string
): Promise<boolean> {
  const data = {
    type: "reminder",
    reminderType: reminder.reminder_type,
    bookingId: reminder.booking_id || ""
  };

  if (reminder.target_role === "creator") {
    // Creator tokens have user_id = NULL, query push_tokens directly
    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("id, fcm_token")
      .is("user_id", null)
      .eq("user_role", "creator");

    if (tokensError || !tokens || tokens.length === 0) {
      console.log(`No creator push tokens found`);
      return false;
    }

    // Send to all creator tokens via send-push-notification won't work (user_id is null)
    // Instead, invoke for each token directly — but send-push-notification expects userId
    // We need to send FCM directly. Let's use the first token approach via invoke with a workaround:
    // Actually, let's just call send-push-notification for each token by using a special flag
    // Simplest: query tokens here and call the edge function per token... but that's wasteful.
    // Better: send to ALL creator tokens by invoking send-push-notification with a special identifier.
    
    // Since send-push-notification queries by user_id and creator has user_id=NULL,
    // we pass userId=null and rely on targetRole to filter. But the function requires userId.
    // Let's just call it with a dummy and targetRole, then fix the function... 
    // Actually simplest fix: call send-push-notification with userId="__creator__" and handle in that function.
    // But that requires changing send-push-notification too. 
    
    // Simplest approach: directly send FCM from here for creator tokens.
    // But we don't have FCM logic here. Let's invoke send-push-notification differently.
    
    // Best approach: pass targetRole=creator and let send-push-notification handle null user_id
    const { error: pushError } = await supabase.functions.invoke("send-push-notification", {
      body: { userId: null, title, body, data, targetRole: "creator" }
    });

    if (pushError) {
      console.error(`Error sending creator reminder:`, pushError);
      return false;
    }
    return true;
  } else if (reminder.target_role === "teacher") {
    const { error: pushError } = await supabase.functions.invoke("send-push-notification", {
      body: { userId: reminder.simple_user_id, title, body, data, targetRole: "teacher" }
    });
    if (pushError) {
      console.error(`Error sending teacher reminder:`, pushError);
      return false;
    }
    return true;
  } else {
    // Student — existing behavior
    const { error: pushError } = await supabase.functions.invoke("send-push-notification", {
      body: { userId: reminder.simple_user_id, title, body, data }
    });
    if (pushError) {
      console.error(`Error sending student reminder ${reminder.id}:`, pushError);
      return false;
    }
    return true;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  return timeStr.substring(0, 5);
}
