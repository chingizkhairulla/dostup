/** Payment methods a seller can offer on one pricing option; any combination is valid. */
export type PaymentMethod = "link" | "phone" | "card";

export const PAYMENT_METHODS: PaymentMethod[] = ["link", "phone", "card"];

/** Longest card number in circulation (Maestro) is 19 digits. */
const MAX_CARD_DIGITS = 19;

/**
 * Groups a card number into blocks of four as it is typed: 4400 4302 1234 5678.
 * Non-digits are dropped, so pasting a number with dashes or spaces works too.
 */
export function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_CARD_DIGITS);
  if (!digits) return "";
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

/** A card is plausible once it has at least the 12 digits the shortest schemes use. */
export function isCardNumberComplete(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 12 && digits.length <= MAX_CARD_DIGITS;
}

/** Digits only — what gets copied to the clipboard, since banks reject spaces. */
export function cardDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, MAX_CARD_DIGITS);
}
