import type { Language, TranslationKey } from "@/lib/translations";

/**
 * The server answers in Russian; these known answers are shown in the interface language.
 * Anything else is shown as it came.
 */
const KNOWN: Record<string, TranslationKey> = {
  "Мест нет": "productNoSeats",
  "Оплата откроется после разрешения продавца": "payPermissionRequired",
  "Сначала получите пробный доступ": "trialFirst",
  "Пробный доступ уже был использован": "trialAlreadyUsed",
  "Пробный доступ недоступен": "trialUnavailable",
  "Доступно после пробного урока": "storefrontApplyAfterLesson",
  "Оплата уже доступна": "paymentAlreadyOpen",
  "Переключитесь на профиль покупателя": "switchToBuyerTitle",
  "На пробном можно записаться только на один слот": "trialOneSlot",
  "Напишите сообщение": "writeMessage",
  "К сожалению, к тому времени пробный доступ закончится. Оплатите продукт, чтобы записаться на слот": "trialEndsBeforeSlot",
  "Удалить продукт нельзя, пока есть активные пользователи": "deleteProductBlocked",
};

export function localizeServerMessage(
  message: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const key = KNOWN[message.trim()];
  return key ? t(key) : message;
}

/** "7 дней" / "7 күн". */
export function daysLabel(n: number, language: Language): string {
  if (language === "kk") return `${n} күн`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
}
