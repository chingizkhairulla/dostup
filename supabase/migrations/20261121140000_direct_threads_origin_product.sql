-- Чат с витрины: покупатель может написать продавцу без покупки. Если он начал с витрины
-- продукта, чат лежит у продавца во вкладке этого продукта; с витрины продавца — в «Неактивных».
ALTER TABLE public.direct_threads
  ADD COLUMN IF NOT EXISTS origin_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.direct_threads.origin_product_id IS
  'Product whose storefront the buyer last opened the chat from; NULL — from the seller storefront.';
