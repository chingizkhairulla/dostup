-- Drop legacy kaspi columns from products table
-- All data has been migrated to payment_methods and product_payment_methods junction table

ALTER TABLE public.products DROP COLUMN IF EXISTS kaspi_link;
ALTER TABLE public.products DROP COLUMN IF EXISTS kaspi_phone;
