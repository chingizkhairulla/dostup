import heic2any from "heic2any";

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB

export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export async function convertHeicToJpegIfNeeded(file: File): Promise<File> {
  if (!isHeicFile(file)) {
    return file;
  }

  try {
    const conversionResult = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.92,
    });

    const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (error) {
    console.error("HEIC conversion failed:", error);
    // If conversion fails, return original file so server can attempt inspection
    return file;
  }
}

export interface SubmitReceiptParams {
  file: File;
  productId: string;
  paymentMethodId: string;
  sessionToken: string;
  assignedTeacherId?: string | null;
  canChooseTeacher?: boolean;
  purchaseId?: string | null;
}

export interface SubmitReceiptResponse {
  ok: boolean;
  purchaseId: string;
  submissionId: string;
  purchaseStatus: string;
  verificationStatus: string;
  receiptPath?: string;
  already_completed?: boolean;
  message?: string;
}

export async function submitPaymentReceipt(
  params: SubmitReceiptParams
): Promise<SubmitReceiptResponse> {
  const convertedFile = await convertHeicToJpegIfNeeded(params.file);

  if (convertedFile.size > MAX_RECEIPT_BYTES) {
    throw new Error("Файл слишком большой. Максимальный размер чека — 10 МБ.");
  }

  const formData = new FormData();
  formData.append("file", convertedFile, convertedFile.name);
  formData.append("sessionToken", params.sessionToken);
  formData.append("productId", params.productId);
  formData.append("paymentMethodId", params.paymentMethodId);

  if (params.assignedTeacherId) {
    formData.append("assignedTeacherId", params.assignedTeacherId);
  }
  if (params.canChooseTeacher) {
    formData.append("canChooseTeacher", "true");
  }
  if (params.purchaseId) {
    formData.append("purchaseId", params.purchaseId);
  }

  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/submit-payment-receipt`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || data.error || "Не удалось отправить чек");
  }

  return data as SubmitReceiptResponse;
}
