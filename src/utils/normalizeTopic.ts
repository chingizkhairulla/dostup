// Нормализация и проверка тем продуктов

// Список запрещённых корней и слов (с поддержкой кириллицы и латиницы)
const BANNED_PATTERNS = [
  /(секс|sex|порно|porno|нарк|drug|интим|intim|бля|хуй|пизд|ебат|ебан|сука)/i,
];

/**
 * Приводит название темы к единому нормализованному виду:
 * - обрезает пробелы по краям
 * - приводит к нижнему регистру
 * - заменяет множественные пробелы на один
 */
export function normalizeTopic(topic: string): string {
  return topic
    .replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Форматирует тему для красивого отображения (первая буква заглавная, сохраняя смайлик)
 */
export function formatTopicName(topic: string): string {
  const trimmed = topic.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const match = trimmed.match(/^([\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\uFE0F\u200D]+\s*)(.*)$/u);
  if (match) {
    const emojiPart = match[1];
    const textPart = match[2];
    if (!textPart) return emojiPart.trim();
    return emojiPart.trim() + " " + textPart.charAt(0).toUpperCase() + textPart.slice(1);
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export interface TopicValidationResult {
  isValid: boolean;
  error?: string;
  normalized: string;
  formatted: string;
}

/**
 * Проверяет валидность создаваемой темы:
 * 1. Не пустая (минимум 2 символа)
 * 2. Не содержит нецензурных или запрещённых слов
 * 3. Не дублирует уже существующие темы (с учётом регистра и пробелов)
 */
export function validateNewTopic(
  name: string,
  existingTopics: string[] = []
): TopicValidationResult {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return {
      isValid: false,
      error: "Название темы слишком короткое (минимум 2 символа)",
      normalized: "",
      formatted: "",
    };
  }

  if (trimmed.length > 50) {
    return {
      isValid: false,
      error: "Название темы слишком длинное (максимум 50 символов)",
      normalized: "",
      formatted: "",
    };
  }

  // Проверка на запрещённые слова
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isValid: false,
        error: "Название темы содержит недопустимые слова",
        normalized: normalizeTopic(trimmed),
        formatted: formatTopicName(trimmed),
      };
    }
  }

  const normalized = normalizeTopic(trimmed);

  // Проверка дубликатов
  const duplicate = existingTopics.find(
    (existing) => normalizeTopic(existing) === normalized
  );

  if (duplicate) {
    return {
      isValid: false,
      error: `Такая тема уже существует: «${duplicate}»`,
      normalized,
      formatted: duplicate,
    };
  }

  return {
    isValid: true,
    normalized,
    formatted: formatTopicName(trimmed),
  };
}

/**
 * Разбирает строку или массив тем в массив отдельных тем
 */
export function parseTopicsList(raw: unknown, knownTopics?: string[]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim());
        }
      } catch {
        // fallback
      }
    }
    // Если строка полностью совпадает с известной темой
    if (knownTopics && knownTopics.some((k) => k.trim() === trimmed)) {
      return [trimmed];
    }
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Объединяет массив тем в единую строку через запятую для сохранения
 */
export function serializeTopicsList(topics: string[]): string {
  return topics
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
}

