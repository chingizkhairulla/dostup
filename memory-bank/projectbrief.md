# Project Brief — Доступ (Dostup)

## Summary
Платформа для продажи курсов и материалов в Казахстане: автор создаёт продукт, ученик оплачивает через Kaspi.kz и получает доступ к материалам и расписанию занятий.

## Stack
- Vite + React + TypeScript, Tailwind CSS, shadcn/ui
- Supabase (база данных, Storage, Edge Functions)
- AWS S3 — хранение файлов материалов
- Firebase Cloud Messaging — push-уведомления

## Key docs
- MIGRATE.md — подключение фронтенда и Supabase-проекта, деплой edge-функций
- CONNECTIONS_AUDIT.md — сравнение подключений старой и новой версии проекта
- VERCEL_SETUP.md — деплой на Vercel

## Platform
- OS: Windows 11
- Shell: PowerShell (primary), Git Bash available
- Package manager: npm (also bun.lock present)
