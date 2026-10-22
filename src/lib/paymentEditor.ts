import {
  DEFAULT_BANK,
  cardDigits,
  filledPaymentMethods,
  isPaymentBank,
  lastFilledPaymentMethod,
  serializeKaspiFields,
  type KaspiMethod,
  type PaymentBank,
  type PaymentMethodFormValue,
  type PaymentOptionLike,
} from "./paymentMethods";
import type { ProductPricingOption } from "@/hooks/useProducts";

export interface PricingOptionFormItem extends PaymentMethodFormValue {
  id: string;
  paymentType: "one_time" | "recurring";
  price: string;
  recurringInterval: string;
  recurringCustomDays: number;
  hasFreeTrial: boolean;
  trialPreset: "3" | "7" | "30" | "custom";
  trialCustomDays: number;
  paymentMethod: KaspiMethod;
  lastPaymentMethod: KaspiMethod;
}

export interface DefaultKaspiSettings {
  methods?: KaspiMethod[];
  link?: string;
  phone?: string;
  card?: string;
  bank?: PaymentBank;
  bankName?: string;
  lastMethod?: KaspiMethod;
}

export const createDefaultPricingOption = (
  id?: string,
  defaults?: DefaultKaspiSettings,
): PricingOptionFormItem => ({
  id: id || Math.random().toString(36).slice(2, 10),
  paymentType: "recurring",
  price: "49000",
  recurringInterval: "1m",
  recurringCustomDays: 30,
  hasFreeTrial: false,
  trialPreset: "7",
  trialCustomDays: 7,
  kaspiMethods: defaults?.methods?.length ? [...defaults.methods] : ["phone"],
  kaspiLink: defaults?.link || "",
  kaspiPhone: defaults?.phone || "",
  kaspiCard: defaults?.card || "",
  bank: defaults?.bank || DEFAULT_BANK,
  bankName: defaults?.bankName || "",
  paymentMethod: defaults?.lastMethod || "phone",
  lastPaymentMethod: defaults?.lastMethod || "phone",
});

/** Старые продукты с одной ссылкой открываются на ссылке; новые — на телефоне. */
export const kaspiSettingsFromStored = (
  option: PaymentOptionLike | null | undefined,
  fallback?: PaymentOptionLike | null,
): Required<DefaultKaspiSettings> => {
  const source = option && (option.last_payment_method || option.kaspi_link || option.kaspi_phone || option.kaspi_card)
    ? option : (fallback || option || {});
  const value: PaymentMethodFormValue = {
    kaspiMethods: [],
    kaspiLink: source.kaspi_link || "",
    kaspiPhone: source.kaspi_phone || "",
    kaspiCard: cardDigits(source.kaspi_card),
    bank: isPaymentBank(source.bank) ? source.bank : DEFAULT_BANK,
    bankName: source.bank_name || "",
    lastPaymentMethod: source.last_payment_method === "link" || source.last_payment_method === "phone" || source.last_payment_method === "card"
      ? source.last_payment_method : undefined,
  };
  const methods = filledPaymentMethods(value);
  return {
    methods: methods.length ? methods : ["phone"],
    link: value.kaspiLink,
    phone: value.kaspiPhone,
    card: value.kaspiCard,
    bank: value.bank,
    bankName: value.bankName,
    lastMethod: lastFilledPaymentMethod(value),
  };
};

export const serializePricingOption = (option: PricingOptionFormItem): ProductPricingOption => {
  const recurring = option.paymentType === "recurring";
  const intervals: Record<string, number> = { "7d": 7, "14d": 14, "1m": 30, "3m": 90, "1y": 365 };
  const billingPeriods: Record<string, string> = { "1m": "month", "3m": "quarter", "1y": "year" };
  const accessDays = recurring
    ? intervals[option.recurringInterval] ?? (option.recurringInterval === "custom" ? option.recurringCustomDays || 30 : null)
    : null;
  const trialDays = option.hasFreeTrial
    ? option.trialPreset === "custom" ? option.trialCustomDays || 7 : Number(option.trialPreset)
    : null;
  return {
    id: option.id,
    payment_type: option.paymentType,
    price: Number(option.price) || 0,
    recurring_interval: recurring ? option.recurringInterval : null,
    access_duration_days: accessDays,
    billing_period: recurring ? billingPeriods[option.recurringInterval] || option.recurringInterval : null,
    has_free_trial: option.hasFreeTrial,
    trial_days: trialDays,
    ...serializeKaspiFields(option),
  };
};

/** Закрытие редактора сохраняет реквизиты, не публикуя изменения цены и других полей продукта. */
export const buildPaymentDetailsUpdate = (
  product: PaymentOptionLike & { price: number; pricing_options?: ProductPricingOption[] | null },
  initial: PricingOptionFormItem[],
  current: PricingOptionFormItem[],
) => {
  const changes = new Map<string, PricingOptionFormItem>();
  for (const option of current) {
    const previous = initial.find((item) => item.id === option.id);
    if (previous) {
      if (JSON.stringify(serializeKaspiFields(previous)) !== JSON.stringify(serializeKaspiFields(option))) {
        changes.set(option.id, option);
      }
    } else if (filledPaymentMethods(option).length) {
      if (!(Number(option.price) > 0)) throw new Error("Укажите цену для нового варианта оплаты");
      changes.set(option.id, option);
    }
  }
  if (changes.size === 0) return null;

  // Сохраняем свойства и порядок прежних тарифов. Удаление тарифа подтверждается кнопкой «Сохранить».
  const stored = product.pricing_options?.length ? product.pricing_options : initial.map(serializePricingOption);
  const options = initial.map((option, index) => ({
    ...stored[index],
    ...(changes.has(option.id) ? serializeKaspiFields(changes.get(option.id)!) : {}),
  }));
  for (const [id, option] of changes) {
    if (!initial.some((item) => item.id === id)) options.push(serializePricingOption(option));
  }
  return {
    pricing_options: options,
    kaspi_link: product.price > 0 ? options[0]?.kaspi_link || null : null,
    kaspi_phone: product.price > 0 ? options[0]?.kaspi_phone || null : null,
  };
};
