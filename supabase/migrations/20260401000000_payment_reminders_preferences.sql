-- Add payment reminder preferences to notification_preferences table
ALTER TABLE IF EXISTS public.notification_preferences
ADD COLUMN IF NOT EXISTS payment_reminder_week BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS payment_reminder_day BOOLEAN DEFAULT TRUE;
