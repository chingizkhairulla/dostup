-- Пробный доступ двух видов, оплата «только с разрешения», заявки и лист ожидания.

-- 1. Продукт: вид пробного и текст его кнопки, настройки листа ожидания.
--    trial_mode: 'lesson' — «Урок / Консультация» (оплата только с разрешения продавца),
--                'period' — «Период времени» на trial_days дней (свободная покупка).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS trial_mode text,
  ADD COLUMN IF NOT EXISTS trial_button_text text,
  ADD COLUMN IF NOT EXISTS waitlist_auto_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waitlist_pay_days integer NOT NULL DEFAULT 7;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_trial_mode_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_trial_mode_check CHECK (trial_mode IS NULL OR trial_mode IN ('lesson', 'period'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_waitlist_pay_days_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_waitlist_pay_days_check CHECK (waitlist_pay_days >= 1);

-- Пробный раньше задавался в вариантах оплаты числом дней — он становится «Периодом времени».
UPDATE public.products p
SET trial_mode = 'period',
    has_free_trial = true,
    trial_days = COALESCE(
      NULLIF(p.trial_days, 0),
      (SELECT NULLIF((opt ->> 'trial_days')::int, 0)
         FROM jsonb_array_elements(COALESCE(p.pricing_options, '[]'::jsonb)) opt
        WHERE COALESCE((opt ->> 'has_free_trial')::boolean, false)
        LIMIT 1),
      7)
WHERE p.trial_mode IS NULL
  AND (
    COALESCE(p.has_free_trial, false)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p.pricing_options, '[]'::jsonb)) opt
      WHERE COALESCE((opt ->> 'has_free_trial')::boolean, false)
    )
  );

-- 2. Заявки на оплату и лист ожидания: одна строка на продукт и покупателя.
--    pending — «Ожидающие»; allowed — «Могут оплатить»; closed — «Оплата закрыта»
--    (обе в «Листе ожидания»); removed — продавец убрал из листа навсегда; left — покупатель
--    сам вышел из листа. После removed и left пробный и покупка этому человеку закрыты.
CREATE TABLE IF NOT EXISTS public.product_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allowed', 'closed', 'removed', 'left')),
  -- Порядок в листе ожидания и очередь на освободившиеся места — по дате подачи заявки.
  applied_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  -- Оплата, открытая автоматически, закрывается сама после этой даты.
  pay_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_applications_product_buyer_key UNIQUE (product_id, buyer_profile_id)
);

CREATE INDEX IF NOT EXISTS product_applications_product_status_idx
  ON public.product_applications (product_id, status, applied_at);
CREATE INDEX IF NOT EXISTS product_applications_buyer_idx
  ON public.product_applications (buyer_profile_id);

ALTER TABLE public.product_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_applications FROM anon, authenticated;
GRANT ALL ON TABLE public.product_applications TO service_role;

-- 3. «Пробный урок прошёл?»: ответ продавца по каждой записи на слот во время пробного.
CREATE TABLE IF NOT EXISTS public.trial_lesson_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  time_slot_id uuid NOT NULL REFERENCES public.time_slots(id) ON DELETE CASCADE,
  held boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trial_lesson_checks_slot_buyer_key UNIQUE (time_slot_id, buyer_profile_id)
);

ALTER TABLE public.trial_lesson_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trial_lesson_checks FROM anon, authenticated;
GRANT ALL ON TABLE public.trial_lesson_checks TO service_role;

-- 4. Уведомления платформы покупателю или продавцу («Пробный доступ окончен»,
--    «Вам открыли оплату…», «Места освободились…» и т. п.).
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  creator_account_id uuid REFERENCES public.creator_accounts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT app_notifications_one_recipient CHECK ((buyer_profile_id IS NULL) <> (creator_account_id IS NULL))
);

CREATE INDEX IF NOT EXISTS app_notifications_buyer_idx ON public.app_notifications (buyer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_notifications_creator_idx ON public.app_notifications (creator_account_id, created_at DESC);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_notifications FROM anon, authenticated;
GRANT ALL ON TABLE public.app_notifications TO service_role;

-- 5. Пробный «Урок / Консультация» не имеет даты окончания: он закрывается, когда продавец
--    отвечает «Да» на «Пробный урок прошёл?».
ALTER TABLE public.product_trials ALTER COLUMN ends_at DROP NOT NULL;
ALTER TABLE public.product_trials ALTER COLUMN trial_days DROP NOT NULL;
