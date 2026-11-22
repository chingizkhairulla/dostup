-- «Максимальное число покупателей»: сколько оплативших могут пользоваться продуктом
-- одновременно. NULL — без ограничений (так остаются все существующие продукты).
-- Пробный доступ место не занимает.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS max_buyers integer;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_max_buyers_positive;
ALTER TABLE public.products
  ADD CONSTRAINT products_max_buyers_positive CHECK (max_buyers IS NULL OR max_buyers >= 1);

COMMENT ON COLUMN public.products.max_buyers IS
  'Paid buyers allowed at once; NULL means no limit. Trials do not take a seat.';
