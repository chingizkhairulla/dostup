export const MAX_CHAT_ATTACHMENTS = 10;
const DOCUMENT_TYPES = new Set([
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "application/zip",
]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);
export function chatFileError(file: Pick<File, "type" | "size">): string | null {
  const video = file.type.startsWith("video/");
  if (!video && !IMAGE_TYPES.has(file.type) && !DOCUMENT_TYPES.has(file.type)) return "Этот формат файла не поддерживается";
  const max = (video ? 500 : 50) * 1024 * 1024;
  if (!file.size) return "Файл пуст";
  if (file.size > max) return `Максимальный размер файла — ${video ? 500 : 50} МБ`;
  return null;
}
