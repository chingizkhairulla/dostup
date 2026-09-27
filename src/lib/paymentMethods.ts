// Способы оплаты продавца: ссылка / номер телефона / номер карты + банк.

export type KaspiMethod = "link" | "phone" | "card";
export type PaymentBank = "kaspi" | "halyk" | "freedom" | "other";

export const KASPI_METHOD_ORDER: KaspiMethod[] = ["link", "phone", "card"];

export const KASPI_METHOD_LABELS: Record<KaspiMethod, string> = {
  link: "🔗 Ссылка",
  phone: "📱 Телефон",
  card: "💳 Карта",
};

export const BANK_OPTIONS: Array<{ value: PaymentBank; label: string }> = [
  { value: "kaspi", label: "Kaspi" },
  { value: "halyk", label: "Halyk" },
  { value: "freedom", label: "Freedom" },
  { value: "other", label: "Другой банк" },
];

export const DEFAULT_BANK: PaymentBank = "kaspi";
export const CARD_DIGITS = 16;

export const isPaymentBank = (value: unknown): value is PaymentBank =>
  value === "kaspi" || value === "halyk" || value === "freedom" || value === "other";

/** Оставляет только цифры, максимум 16. */
export const cardDigits = (raw: string | null | undefined): string =>
  (raw || "").replace(/\D/g, "").slice(0, CARD_DIGITS);

/** 1234567890123456 → "1234 5678 9012 3456" */
export const formatCardNumber = (raw: string | null | undefined): string =>
  cardDigits(raw).replace(/(\d{4})(?=\d)/g, "$1 ");

export const isValidCardNumber = (raw: string | null | undefined): boolean =>
  cardDigits(raw).length === CARD_DIGITS;

/** Название банка для показа покупателю. */
export const bankLabel = (bank: unknown, bankName?: string | null): string => {
  if (bank === "other") return (bankName || "").trim() || "банк";
  const found = BANK_OPTIONS.find((b) => b.value === bank);
  return found ? found.label : "Kaspi";
};

export interface PaymentOptionLike {
  kaspi_link?: string | null;
  kaspi_phone?: string | null;
  kaspi_card?: string | null;
  bank?: string | null;
  bank_name?: string | null;
}

export interface ResolvedPaymentMethods {
  link: string | null;
  phone: string | null;
  card: string | null;
  bank: PaymentBank;
  bankName: string;
  bankLabel: string;
  hasAny: boolean;
}

/**
 * Собирает способы оплаты для покупателя: сначала из выбранного тарифа,
 * иначе из полей продукта (старые продукты без pricing_options).
 */
export const resolvePaymentMethods = (
  option: PaymentOptionLike | null | undefined,
  product: PaymentOptionLike | null | undefined,
): ResolvedPaymentMethods => {
  const optionHasAny = Boolean(option?.kaspi_link || option?.kaspi_phone || option?.kaspi_card);
  const src: PaymentOptionLike = optionHasAny ? option! : (product ?? {});
  const bank: PaymentBank = isPaymentBank(src.bank) ? src.bank : DEFAULT_BANK;
  const bankName = src.bank_name || "";
  const link = src.kaspi_link?.trim() || null;
  const phone = src.kaspi_phone?.trim() || null;
  const card = src.kaspi_card ? cardDigits(src.kaspi_card) || null : null;
  return {
    link,
    phone,
    card,
    bank,
    bankName,
    bankLabel: bankLabel(bank, bankName),
    hasAny: Boolean(link || phone || card),
  };
};
