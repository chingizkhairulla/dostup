# Доступ (Dostup)

Платформа для продажи курсов и материалов в Казахстане: автор создаёт продукт, ученик оплачивает через Kaspi.kz и получает доступ к материалам и расписанию занятий.

## Стек

- Vite + React + TypeScript, Tailwind CSS, shadcn/ui
- Supabase (база данных, Storage, Edge Functions)
- AWS S3 — хранение файлов материалов
- Firebase Cloud Messaging — push-уведомления

## Запуск

```bash
npm install
npm run dev      # http://localhost:8080
```

Перед запуском скопируйте `.env.example` в `.env` и заполните значения (Project ID, URL и ключ Supabase).

Другие команды:

```bash
npm run build      # сборка проекта
npm run lint        # проверка кода
npm run preview      # локальный просмотр собранной версии
npm run native:sync  # сборка фронтенда и синхронизация Android/iOS
npm run android:open # открыть Android-проект после синхронизации
npm run ios:open     # открыть iOS-проект после синхронизации (только macOS)
```

Нативные оболочки находятся в `android/` и `ios/`. Они используют тот же
фронтенд, simple auth, Supabase Edge Functions и Storage; отдельного backend для
мобильных приложений нет.

## Документация

- [MIGRATE.md](./MIGRATE.md) — подключение фронтенда и Supabase-проекта, деплой edge-функций
- [CONNECTIONS_AUDIT.md](./CONNECTIONS_AUDIT.md) — сравнение подключений старой и новой версии проекта
- [VERCEL_SETUP.md](./VERCEL_SETUP.md) — деплой на Vercel
- [docs/native-screen-capture-protection.md](./docs/native-screen-capture-protection.md) — подключение нативной защиты раздела «Материалы»
