/**
 * Payment methods validation, masks, and formatting helpers.
 */

export function validateLuhn(cardNumber: string | null | undefined): boolean {
  if (!cardNumber) return false;
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length !== 16) return false;
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

export function formatCardInput(value: string | null | undefined): string {
  const digits = (value || "").replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function maskCardNumber(cardNumber: string | null | undefined): string {
  const digits = (cardNumber || "").replace(/\D/g, "");
  if (!digits) return "••••";
  if (digits.length < 4) return "•••• " + digits;
  const last4 = digits.slice(-4);
  return `•••• ${last4}`;
}

export function formatCardDisplay(cardNumber: string | null | undefined): string {
  const digits = (cardNumber || "").replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/**
 * Extracts exactly up to 10 phone digits after the country code.
 * Strips leading 7 or 8 ONLY if the total digits count is 11 (e.g. 8701... or +7 701...).
 * If 10 digits are passed (e.g. 7011234567), leading 7 is preserved!
 */
export function extractPhone10Digits(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return digits.slice(1);
  }
  return digits.slice(0, 10);
}

/**
 * Formats 10 digits into "XXX XXX XX XX"
 */
export function format10Digits(digits: string): string {
  const d = (digits || "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

export function formatPhoneInput(value: string | null | undefined): string {
  if (!value) return "";
  const ten = extractPhone10Digits(value);
  if (!ten) return "";
  return `+7 ${format10Digits(ten)}`;
}

export function cleanPhone(value: string | null | undefined): string {
  if (!value) return "";
  const ten = extractPhone10Digits(value);
  return ten ? `+7${ten}` : "";
}

export function isValidKazakhPhone(value: string | null | undefined): boolean {
  return extractPhone10Digits(value).length === 10;
}

export function getBankDisplayName(bank?: string | null, bankName?: string | null): string {
  if (!bank) return "";
  const b = String(bank).toLowerCase();
  if (b === "kaspi") return "Kaspi";
  if (b === "halyk") return "Halyk";
  if (b === "freedom") return "Freedom";
  if (b === "other") return bankName?.trim() || "Другой банк";
  return bank;
}

export const EMOJI_FONT_STACK = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
