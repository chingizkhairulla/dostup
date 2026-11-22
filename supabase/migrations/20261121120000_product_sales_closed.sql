-- «Завершить продажи»: никто не может купить продукт или оплатить его снова. Уже купившие
-- пользуются им до конца своего доступа; когда активных не останется, продукт можно удалить.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sales_closed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.sales_closed IS
  'Seller ended sales: no new purchases or repeat payments; the storefront shows "Мест нет".';

-- Кнопки «Приостановить» больше нет, поэтому приостановленные продукты возвращаются в продажу.
UPDATE public.products
SET is_paused = false, paused_message = NULL
WHERE is_paused = true;
