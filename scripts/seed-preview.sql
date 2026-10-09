-- Тестовые данные для Preview-окружения Supabase

-- 1. Тестовый продавец
INSERT INTO public.profiles (id, type, display_name, handle, is_demo)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'creator',
  'Тестовый Автор',
  'test-seller',
  true
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  handle = EXCLUDED.handle,
  is_demo = true;

INSERT INTO public.creator_accounts (id, profile_id, display_name, login, email, account_type)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Тестовый Автор',
  'testseller',
  'testseller@trydostup.online',
  'course_creator'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email;

-- 2. Тестовые товары
INSERT INTO public.products (
  id, creator_account_id, creator_id, title, headline, description,
  price, slug, is_active, is_paused, is_demo, is_published, category_id, subcategory_id, lesson_format
)
VALUES
(
  '33333333-3333-3333-3333-333333333331',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Тестовый курс по веб-разработке',
  'Полный практический курс от основ до создания реального проекта',
  'Тестовое описание курса для проверки работы каталога и покупок.',
  15000,
  'test-web-course',
  true,
  false,
  true,
  true,
  'b61a33a3-003b-4909-8951-5540d7867f56',
  'c2000000-0000-0000-0000-000000000001',
  null
),
(
  '33333333-3333-3333-3333-333333333332',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Онлайн-урок английского языка',
  'Индивидуальное занятие с преподавателем',
  'Тестовое занятие для проверки расписания и бронирований.',
  5000,
  'test-english-lesson',
  true,
  false,
  true,
  true,
  '09653df8-e6e8-4aae-8ac7-11c3e0eadee1',
  'c1000000-0000-0000-0000-000000000001',
  'individual'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  price = EXCLUDED.price,
  is_active = true,
  is_demo = true,
  is_published = true;

-- 3. Тестовые покупатели
INSERT INTO public.profiles (id, type, display_name, handle, is_demo)
VALUES
(
  '44444444-4444-4444-4444-444444444441',
  'buyer',
  'Алихан Смагулов',
  'alikhan-smagulov',
  true
),
(
  '44444444-4444-4444-4444-444444444442',
  'buyer',
  'Динара Касымова',
  'dinara-kassymova',
  true
),
(
  '44444444-4444-4444-4444-444444444443',
  'buyer',
  'Ерлан Бериков',
  'erlan-berikov',
  true
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  handle = EXCLUDED.handle,
  is_demo = true;

-- 4. Тестовые покупки
INSERT INTO public.simple_purchases (
  id, product_id, buyer_profile_id, status, amount, confirmed_at, created_at
)
VALUES
(
  '55555555-5555-5555-5555-555555555551',
  '33333333-3333-3333-3333-333333333331',
  '44444444-4444-4444-4444-444444444441',
  'completed',
  15000,
  now(),
  now() - interval '2 days'
),
(
  '55555555-5555-5555-5555-555555555552',
  '33333333-3333-3333-3333-333333333332',
  '44444444-4444-4444-4444-444444444442',
  'completed',
  5000,
  now(),
  now() - interval '1 day'
),
(
  '55555555-5555-5555-5555-555555555553',
  '33333333-3333-3333-3333-333333333331',
  '44444444-4444-4444-4444-444444444443',
  'pending',
  15000,
  null,
  now() - interval '3 hours'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  amount = EXCLUDED.amount;
