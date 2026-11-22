-- Уведомления платформы показываются на языке человека: текст собирается в приложении по виду
-- уведомления (kind) и его параметрам (название продукта, имя, число). title и body остаются
-- русским текстом на случай, если вид незнаком.
ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb;
