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
  'test-seller@test.dostup.local',
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
  'Практический курс от основ HTML/CSS до полноценного веб-приложения',
  'Полный обучающий курс для начинающих разработчиков с домашними заданиями и разборами.',
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
  'Разговорная практика, преодоление языкового барьера и разбор грамматики.',
  5000,
  'test-english-lesson',
  true,
  false,
  true,
  true,
  '09653df8-e6e8-4aae-8ac7-11c3e0eadee1',
  'c1000000-0000-0000-0000-000000000001',
  'individual'
),
(
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Интенсив по UI/UX дизайну в Figma',
  'Создание современных интерфейсов с нуля',
  'Пошаговый интенсив: компоненты, автолейауты, дизайн-системы и подготовка макетов к верстке.',
  20000,
  'test-figma-design',
  true,
  false,
  true,
  true,
  'b61a33a3-003b-4909-8951-5540d7867f56',
  'c2000000-0000-0000-0000-000000000001',
  null
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
),
(
  '44444444-4444-4444-4444-444444444444',
  'buyer',
  'Айгерим Муратова',
  'aigerim-muratova',
  true
),
(
  '44444444-4444-4444-4444-444444444445',
  'buyer',
  'Тимур Ахметов',
  'timur-akhmetov',
  true
),
(
  '44444444-4444-4444-4444-444444444446',
  'buyer',
  'Мадина Серикова',
  'madina-serikova',
  true
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  handle = EXCLUDED.handle,
  is_demo = true;

-- 4. Тестовые покупки (разные статусы: куплено, ожидание, отменено)
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
  now() - interval '3 days',
  now() - interval '3 days'
),
(
  '55555555-5555-5555-5555-555555555552',
  '33333333-3333-3333-3333-333333333332',
  '44444444-4444-4444-4444-444444444442',
  'completed',
  5000,
  now() - interval '2 days',
  now() - interval '2 days'
),
(
  '55555555-5555-5555-5555-555555555553',
  '33333333-3333-3333-3333-333333333331',
  '44444444-4444-4444-4444-444444444443',
  'pending',
  15000,
  null,
  now() - interval '4 hours'
),
(
  '55555555-5555-5555-5555-555555555554',
  '33333333-3333-3333-3333-333333333331',
  '44444444-4444-4444-4444-444444444444',
  'completed',
  15000,
  now() - interval '5 days',
  now() - interval '5 days'
),
(
  '55555555-5555-5555-5555-555555555555',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  'completed',
  20000,
  now() - interval '1 day',
  now() - interval '1 day'
),
(
  '55555555-5555-5555-5555-555555555556',
  '33333333-3333-3333-3333-333333333332',
  '44444444-4444-4444-4444-444444444446',
  'revoked',
  5000,
  now() - interval '6 days',
  now() - interval '6 days'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  amount = EXCLUDED.amount;

-- 5. Личные диалоги между продавцом и покупателями
INSERT INTO public.direct_threads (
  id, creator_account_id, buyer_profile_id, last_message_at, last_message_preview, unread_for_creator, unread_for_buyer, created_at
)
VALUES
(
  '66666666-6666-6666-6666-666666666661',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444441',
  now() - interval '20 minutes',
  'Договорились, спасибо большое!',
  1,
  0,
  now() - interval '3 days'
),
(
  '66666666-6666-6666-6666-666666666662',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444442',
  now() - interval '2 hours',
  'Здравствуйте, Динара! Всё разберём на уроке, ничего заранее готовить не нужно 🙂',
  0,
  1,
  now() - interval '2 days'
),
(
  '66666666-6666-6666-6666-666666666663',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  now() - interval '5 hours',
  'Отлично, буду ждать обновления!',
  1,
  0,
  now() - interval '5 days'
),
(
  '66666666-6666-6666-6666-666666666664',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444446',
  now() - interval '1 day',
  'Здравствуйте, Мадина! Понял вас, оформил отмену. Будем рады видеть вас снова!',
  0,
  0,
  now() - interval '6 days'
)
ON CONFLICT (id) DO UPDATE SET
  last_message_at = EXCLUDED.last_message_at,
  last_message_preview = EXCLUDED.last_message_preview,
  unread_for_creator = EXCLUDED.unread_for_creator,
  unread_for_buyer = EXCLUDED.unread_for_buyer;

-- Сообщения в диалогах
INSERT INTO public.direct_messages (id, thread_id, sender, text, attachments, created_at)
VALUES
-- Диалог с Алиханом
(
  '66666666-0000-0000-0000-000000000001',
  '66666666-6666-6666-6666-666666666661',
  'buyer',
  'Здравствуйте! Начал проходить первый модуль по веб-разработке, очень крутая и понятная подача материала 👍',
  '[]'::jsonb,
  now() - interval '2 hours'
),
(
  '66666666-0000-0000-0000-000000000002',
  '66666666-6666-6666-6666-666666666661',
  'creator',
  'Привет, Алихан! Рад, что понравилось. Если возникнут вопросы по домашке — обязательно пиши сюда!',
  '[]'::jsonb,
  now() - interval '1 hour'
),
(
  '66666666-0000-0000-0000-000000000003',
  '66666666-6666-6666-6666-666666666661',
  'buyer',
  'Договорились, спасибо большое!',
  '[]'::jsonb,
  now() - interval '20 minutes'
),

-- Диалог с Динарой
(
  '66666666-0000-0000-0000-000000000004',
  '66666666-6666-6666-6666-666666666662',
  'buyer',
  'Добрый день! Подскажите, пожалуйста, к уроку нужно подготовить домашнее задание или на уроке всё разберем?',
  '[]'::jsonb,
  now() - interval '4 hours'
),
(
  '66666666-0000-0000-0000-000000000005',
  '66666666-6666-6666-6666-666666666662',
  'creator',
  'Здравствуйте, Динара! Всё разберём на уроке, ничего заранее готовить не нужно 🙂',
  '[]'::jsonb,
  now() - interval '2 hours'
),

-- Диалог с Айгерим
(
  '66666666-0000-0000-0000-000000000006',
  '66666666-6666-6666-6666-666666666663',
  'buyer',
  'Добрый день! Посмотрела материалы по дизайну и разработке, всё очень качественно структурировано.',
  '[]'::jsonb,
  now() - interval '8 hours'
),
(
  '66666666-0000-0000-0000-000000000007',
  '66666666-6666-6666-6666-666666666663',
  'creator',
  'Спасибо за обратную связь! На днях добавлю ещё новые чек-листы и шаблоны макетов.',
  '[]'::jsonb,
  now() - interval '6 hours'
),
(
  '66666666-0000-0000-0000-000000000008',
  '66666666-6666-6666-6666-666666666663',
  'buyer',
  'Отлично, буду ждать обновления!',
  '[]'::jsonb,
  now() - interval '5 hours'
),

-- Диалог с Мадиной
(
  '66666666-0000-0000-0000-000000000009',
  '66666666-6666-6666-6666-666666666664',
  'buyer',
  'Здравствуйте! К сожалению, пока не смогу посещать занятия по семейным обстоятельствам.',
  '[]'::jsonb,
  now() - interval '2 days'
),
(
  '66666666-0000-0000-0000-000000000010',
  '66666666-6666-6666-6666-666666666664',
  'creator',
  'Здравствуйте, Мадина! Понял вас, оформил отмену. Будем рады видеть вас снова!',
  '[]'::jsonb,
  now() - interval '1 day'
)
ON CONFLICT (id) DO UPDATE SET
  text = EXCLUDED.text;

-- 6. Каналы / Объявления продавца
INSERT INTO public.announcements (
  id, product_id, creator_id, content_html, order_index, created_at, updated_at
)
VALUES
(
  '77777777-7777-7777-7777-777777777771',
  '33333333-3333-3333-3333-333333333331',
  'testseller',
  '<p>🎉 <strong>Добро пожаловать на курс по веб-разработке!</strong></p><p>В разделе «Материалы» уже доступны первые конспекты и стартовые шаблоны кода. Вводный живой вебинар состоится в эту субботу в 19:00.</p>',
  0,
  now() - interval '3 days',
  now() - interval '3 days'
),
(
  '77777777-7777-7777-7777-777777777772',
  '33333333-3333-3333-3333-333333333331',
  'testseller',
  '<p>💡 <strong>Важное обновление:</strong></p><p>Добавлена шпаргалка по работе с Git и терминалом. Обязательно изучите перед выполнением первого практического задания!</p>',
  1,
  now() - interval '1 day',
  now() - interval '1 day'
),
(
  '77777777-7777-7777-7777-777777777773',
  '33333333-3333-3333-3333-333333333332',
  'testseller',
  '<p>🇬🇧 <strong>Памятка перед уроком английского:</strong></p><p>Пожалуйста, проверьте микрофон и стабильность интернет-соединения за 5 минут до занятия. Ссылка на видеовстречу появится в вашем расписании.</p>',
  0,
  now() - interval '2 days',
  now() - interval '2 days'
),
(
  '77777777-7777-7777-7777-777777777774',
  '33333333-3333-3333-3333-333333333333',
  'testseller',
  '<p>🎨 <strong>Старт интенсива по Figma!</strong></p><p>Все UI-киты и ссылки на Figma Community прикреплены в разделе материалов продукта. Ждём ваши первые концепты макетов!</p>',
  0,
  now() - interval '1 day',
  now() - interval '1 day'
)
ON CONFLICT (id) DO UPDATE SET
  content_html = EXCLUDED.content_html,
  updated_at = now();

-- 7. Учебные материалы продуктов
INSERT INTO public.materials (
  id, product_id, title, type, content, file_url, order_index, parent_id, allow_view, allow_download, teacher_allow_download, created_at
)
VALUES
-- Курс по веб-разработке
(
  '88888888-8888-8888-8888-888888888881',
  '33333333-3333-3333-3333-333333333331',
  'Модуль 1: Основы веб-разработки',
  'folder',
  null,
  null,
  0,
  null,
  true,
  true,
  true,
  now() - interval '3 days'
),
(
  '88888888-8888-8888-8888-888888888882',
  '33333333-3333-3333-3333-333333333331',
  'Конспект: Структура HTML5 и базовые теги',
  'text',
  'HTML (HyperText Markup Language) — язык разметки страниц. Основная структура: <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Мой сайт</title></head><body><h1>Заголовок</h1><p>Основной текст</p></body></html>. Рекомендуемые расширения редактора: Live Server, Prettier.',
  null,
  1,
  '88888888-8888-8888-8888-888888888881',
  true,
  true,
  true,
  now() - interval '3 days'
),
(
  '88888888-8888-8888-8888-888888888883',
  '33333333-3333-3333-3333-333333333331',
  'Официальная документация MDN Web Docs',
  'link',
  null,
  'https://developer.mozilla.org/ru/docs/Web/HTML',
  2,
  '88888888-8888-8888-8888-888888888881',
  true,
  true,
  true,
  now() - interval '3 days'
),
(
  '88888888-8888-8888-8888-888888888884',
  '33333333-3333-3333-3333-333333333331',
  'Запись вводного вебинара курса',
  'video',
  null,
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  3,
  null,
  true,
  true,
  true,
  now() - interval '2 days'
),

-- Онлайн-урок английского
(
  '88888888-8888-8888-8888-888888888885',
  '33333333-3333-3333-3333-333333333332',
  'Чек-лист: 50 фраз для уверенного общения',
  'text',
  '1. Could you please elaborate on that? 2. From my perspective... 3. That sounds very reasonable. 4. To cut a long story short... 5. I really appreciate your assistance.',
  null,
  0,
  null,
  true,
  true,
  true,
  now() - interval '2 days'
),
(
  '88888888-8888-8888-8888-888888888886',
  '33333333-3333-3333-3333-333333333332',
  'Онлайн-словарь и аудио-произношение Cambridge',
  'link',
  null,
  'https://dictionary.cambridge.org',
  1,
  null,
  true,
  true,
  true,
  now() - interval '2 days'
),

-- UI/UX интенсив
(
  '88888888-8888-8888-8888-888888888887',
  '33333333-3333-3333-3333-333333333333',
  'Библиотека готовых компонентов UI-Kit',
  'link',
  null,
  'https://www.figma.com/community',
  0,
  null,
  true,
  true,
  true,
  now() - interval '1 day'
),
(
  '88888888-8888-8888-8888-888888888888',
  '33333333-3333-3333-3333-333333333333',
  'Руководство по сеткам и отступам (8pt Grid)',
  'text',
  'Базовый шаг — 8px (4px для мелких элементов). Размеры кнопок: 32px (sm), 40px (md), 48px (lg). Все отступы между карточками кратны 8, 16, 24, 32px.',
  null,
  1,
  null,
  true,
  true,
  true,
  now() - interval '1 day'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  file_url = EXCLUDED.file_url;
