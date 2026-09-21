export interface PricingOptionFormItem {
  id: string;
  paymentType: "one_time" | "recurring";
  price: string;
  recurringInterval: string;
  recurringCustomDays: number;
  hasFreeTrial: boolean;
  trialPreset: "3" | "7" | "30" | "custom";
  trialCustomDays: number;
  kaspiMethod: "link" | "phone";
  kaspiLink: string;
  kaspiPhone: string;
}

export const createDefaultPricingOption = (
  id?: string,
  defaultKaspi?: { method?: "link" | "phone"; link?: string; phone?: string },
): PricingOptionFormItem => ({
  id: id || Math.random().toString(36).slice(2, 10),
  paymentType: "recurring",
  price: "49000",
  recurringInterval: "1m",
  recurringCustomDays: 30,
  hasFreeTrial: false,
  trialPreset: "7",
  trialCustomDays: 7,
  kaspiMethod: defaultKaspi?.method || "link",
  kaspiLink: defaultKaspi?.link || "",
  kaspiPhone: defaultKaspi?.phone || "",
});

const INTERVAL_DAYS: Record<string, number> = {
  "7d": 7,
  "14d": 14,
  "1m": 30,
  "3m": 90,
  "1y": 365,
};

const INTERVAL_BILLING: Record<string, string> = {
  "1m": "month",
  "3m": "quarter",
  "1y": "year",
};

/** Days of access a recurring option grants per period; null for one-time. */
export function accessDaysFor(opt: PricingOptionFormItem): number | null {
  if (opt.paymentType !== "recurring") return null;
  if (opt.recurringInterval === "custom") return opt.recurringCustomDays || 30;
  return INTERVAL_DAYS[opt.recurringInterval] ?? null;
}

/** Billing period label for a recurring option; null for one-time. */
export function billingPeriodFor(opt: PricingOptionFormItem): string | null {
  if (opt.paymentType !== "recurring") return null;
  return INTERVAL_BILLING[opt.recurringInterval] ?? opt.recurringInterval;
}

/** Length of the free trial in days; null when the option has no trial. */
export function trialDaysFor(opt: PricingOptionFormItem): number | null {
  if (!opt.hasFreeTrial) return null;
  if (opt.trialPreset === "custom") return opt.trialCustomDays || 7;
  return Number(opt.trialPreset) || null;
}
