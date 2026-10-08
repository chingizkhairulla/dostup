-- Rename 'Групповые занятия' subcategory to 'В группе'
UPDATE public.subcategories
SET name_ru = 'В группе', name_kk = 'Топта'
WHERE slug = 'group' AND id = 'c1000000-0000-0000-0000-000000000002'::uuid;
