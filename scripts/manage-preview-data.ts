/**
 * Управление тестовыми данными Preview-окружения
 * 
 * Запуск:
 *   npm run seed:preview   — наполнить базу тестовыми покупателями, товарами и чеками
 *   npm run clean:preview  — удалить все тестовые данные одной командой
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isClean = process.argv.includes("--clean");
const sqlFile = isClean ? "clean-preview.sql" : "seed-preview.sql";
const sqlPath = join(__dirname, sqlFile);

const projectRef = process.env.PREVIEW_PROJECT_REF || "wkqyimqbpmzhscuwhode";
const defaultServiceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrcXlpbXFicG16aHNjdXdob2RlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTU1MDUyNywiZXhwIjoyMTA3MTI2NTI3fQ.-5k4wOXkeSm3jAmfISqkqvwK1L-ecqCeXgKPpCG3bsM";

function getServiceRoleKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const raw = execSync(`npx supabase projects api-keys --project-ref "${projectRef}"`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(raw);
    const key = parsed?.keys?.find((k: { id: string }) => k.id === "service_role")?.api_key;
    if (key) return key;
  } catch {
    // fallback to known default
  }
  return defaultServiceRoleKey;
}

const receiptFiles = [
  "receipts/preview-receipt-alikhan.jpg",
  "receipts/preview-receipt-dinara.jpg",
  "receipts/preview-receipt-erlan.jpg",
  "receipts/preview-receipt-aigerim-1.jpg",
  "receipts/preview-receipt-aigerim-2.jpg",
];

async function syncStorageReceipts(clean: boolean) {
  const serviceKey = getServiceRoleKey();
  const supabase = createClient(`https://${projectRef}.supabase.co`, serviceKey, {
    auth: { persistSession: false },
  });

  if (clean) {
    console.log(`[Preview Storage] Удаление тестовых чеков...`);
    await supabase.storage.from("payment-receipts").remove(receiptFiles);
    return;
  }

  console.log(`[Preview Storage] Загрузка тестовых чеков...`);
  const localImage = join(__dirname, "../public/demo/preview-receipt.jpg");
  if (!existsSync(localImage)) {
    console.warn(`[Preview Storage] Файл ${localImage} не найден, пропуск загрузки чеков.`);
    return;
  }
  const fileBuffer = readFileSync(localImage);

  for (const path of receiptFiles) {
    const { error } = await supabase.storage.from("payment-receipts").upload(path, fileBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) {
      console.warn(`[Preview Storage] Предупреждение при загрузке ${path}:`, error.message);
    }
  }
  console.log(`[Preview Storage] Чеки успешно синхронизированы!`);
}

async function main() {
  console.log(`[Preview DB] ${isClean ? "Очистка" : "Наполнение"} тестовых данных для проекта ${projectRef}...`);

  try {
    execSync(`npx supabase db query --project-ref "${projectRef}" --file "${sqlPath}"`, {
      stdio: "inherit",
      cwd: join(__dirname, ".."),
    });
    await syncStorageReceipts(isClean);
    console.log(`[Preview DB] Все операции успешно завершены!`);
  } catch (e: any) {
    console.error(`[Preview DB] Ошибка выполнения:`, e?.message || e);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
