import { addYears, differenceInCalendarDays, startOfMonth, subMonths, subYears } from "date-fns";

export type BuyerPeriod = "month" | "quarter" | "half" | "year" | "all";

export const BUYER_PERIODS: BuyerPeriod[] = ["month", "quarter", "half", "year", "all"];

/** Start of the "bought within" window; null for all time. */
export function periodStart(period: BuyerPeriod, now = new Date()): Date | null {
  switch (period) {
    case "month":
      return startOfMonth(now);
    case "quarter":
      return subMonths(now, 3);
    case "half":
      return subMonths(now, 6);
    case "year":
      return subYears(now, 1);
    default:
      return null;
  }
}

export interface AccessSource {
  status: string;
  created_at: string;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  access_expires_at?: string | null;
  subscription?: { current_period_end: string; status: string } | null;
}

/** When access (or the paid period of a subscription) ends; null means it never does. */
export function accessEnd(p: AccessSource): Date | null {
  if (p.subscription) return new Date(p.subscription.current_period_end);
  if (p.is_trial && p.trial_ends_at) return new Date(p.trial_ends_at);
  return p.access_expires_at ? new Date(p.access_expires_at) : null;
}

/** Far enough ahead that it reads as "forever" (a subscription opened with no end). */
const FOREVER_AFTER_YEARS = 100;

export type AccessUrgency = "forever" | "far" | "soon" | "very_soon" | "expired" | "closed";

/**
 * Colour-coded state of a buyer's access: far (more than two weeks left), soon (up to two
 * weeks), very soon (three days or less), expired, closed by the seller, or no end at all.
 */
export function accessUrgency(p: AccessSource, now = new Date()): { urgency: AccessUrgency; daysLeft: number | null } {
  if (p.status === "revoked") return { urgency: "closed", daysLeft: null };
  const end = accessEnd(p);
  if (!end || end > addYears(now, FOREVER_AFTER_YEARS)) return { urgency: "forever", daysLeft: null };
  const daysLeft = differenceInCalendarDays(end, now);
  if (end <= now) return { urgency: "expired", daysLeft: 0 };
  if (daysLeft <= 3) return { urgency: "very_soon", daysLeft };
  if (daysLeft <= 14) return { urgency: "soon", daysLeft };
  return { urgency: "far", daysLeft };
}

export const URGENCY_CLASSES: Record<AccessUrgency, string> = {
  forever: "bg-muted text-muted-foreground",
  far: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  soon: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  very_soon: "bg-red-500/15 text-red-600 dark:text-red-400",
  expired: "bg-red-500/10 text-red-600/80 dark:text-red-400/80",
  closed: "bg-muted text-muted-foreground",
};

export function formatAccessDuration(days: number, language: string = "ru"): string {
  if (days <= 0) return language === "ru" ? "Закрыт" : "Жабық";
  if (days >= 28 && days <= 31) return language === "ru" ? "1 месяц" : "1 ай";
  if (days >= 58 && days <= 62) return language === "ru" ? "2 месяца" : "2 ай";
  if (days >= 88 && days <= 93) return language === "ru" ? "3 месяца" : "3 ай";
  if (days >= 178 && days <= 185) return language === "ru" ? "6 месяцев" : "6 ай";
  if (days >= 360 && days <= 366) return language === "ru" ? "1 год" : "1 жыл";

  if (language === "ru") {
    const mod10 = days % 10;
    const mod100 = days % 100;
    let word = "дней";
    if (mod10 === 1 && mod100 !== 11) word = "день";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = "дня";
    return `${days} ${word}`;
  } else {
    return `${days} күн`;
  }
}

export function getGrantedAccessPeriod(purchase: AccessSource, language: string = "ru"): string {
  if (purchase.status === "revoked") {
    return language === "ru" ? "Закрыт" : "Жабық";
  }
  const { urgency } = accessUrgency(purchase);
  if (urgency === "closed" || urgency === "expired") {
    return language === "ru" ? "Закрыт" : "Жабық";
  }
  if (urgency === "forever" || !accessEnd(purchase)) {
    return language === "ru" ? "Навсегда" : "Мерзімсіз";
  }

  const prod = (purchase as any).product;
  const billingPeriod = prod?.billing_period;
  if (billingPeriod === "month") return language === "ru" ? "1 месяц" : "1 ай";
  if (billingPeriod === "quarter") return language === "ru" ? "3 месяца" : "3 ай";
  if (billingPeriod === "year") return language === "ru" ? "1 год" : "1 жыл";

  const end = accessEnd(purchase);
  if (end) {
    const start = new Date(purchase.created_at);
    let totalDays = differenceInCalendarDays(end, start);
    const daysLeft = differenceInCalendarDays(end, new Date());
    if (totalDays <= 0 && daysLeft > 0) totalDays = daysLeft;
    if (totalDays > 0) {
      return formatAccessDuration(totalDays, language);
    }
  }
  return language === "ru" ? "Навсегда" : "Мерзімсіз";
}
