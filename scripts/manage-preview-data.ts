/**
 * Управление тестовыми данными Preview-окружения
 * 
 * Запуск:
 *   npm run seed:preview   — наполнить базу тестовыми покупателями и товарами
 *   npm run clean:preview  — удалить все тестовые данные одной командой
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isClean = process.argv.includes("--clean");
const sqlFile = isClean ? "clean-preview.sql" : "seed-preview.sql";
const sqlPath = join(__dirname, sqlFile);

const projectRef = process.env.PREVIEW_PROJECT_REF || "wkqyimqbpmzhscuwhode";

console.log(`[Preview DB] ${isClean ? "Очистка" : "Наполнение"} тестовых данных для проекта ${projectRef}...`);

try {
  execSync(`npx supabase db query --project-ref "${projectRef}" --file "${sqlPath}"`, {
    stdio: "inherit",
    cwd: join(__dirname, ".."),
  });
  console.log(`[Preview DB] Успешно завершено!`);
} catch (e: any) {
  console.error(`[Preview DB] Ошибка выполнения:`, e?.message || e);
  process.exit(1);
}
