import { inDeviceLanguage as l } from "@/lib/language";

/**
 * Thrown when the seller cancels an upload or a video compression.
 *
 * Callers used to recognise a cancellation by comparing the error's message
 * with the Russian sentence "Загрузка отменена". That only works while the
 * message is one fixed string: once it is shown in the reader's language the
 * comparison fails for everyone but Russian readers, and a cancelled upload
 * is reported as a failed one. The class is what callers check now.
 */
export class UploadCancelledError extends Error {
  constructor() {
    super(l({ ru: "Загрузка отменена", kk: "Жүктеу тоқтатылды", en: "Upload cancelled" }));
    this.name = "UploadCancelledError";
  }
}

export function isUploadCancelled(error: unknown): boolean {
  return error instanceof UploadCancelledError;
}
