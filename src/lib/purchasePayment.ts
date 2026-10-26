import { differenceInCalendarDays } from "date-fns";

/** Access that ends within this many days shows «Скоро». */
export const RENEW_SOON_DAYS = 7;

export type RenewUrgency = "far" | "soon" | "expired";

/** What the «Доступ» column says. */
export type AccessTerm =
  | { kind: "forever" }
  /** Bought for a period: «7d», «14d», «1m», «3m», «1y» or «custom» with its number of days. */
  | { kind: "period"; interval: string; days: number }
  /** An end date with no period behind it (set by the seller). */
  | { kind: "until"; end: Date }
  | { kind: "trial" };

/** What the «Оплата» column says. */
export type PaymentState =
  | { kind: "paid" }
  | { kind: "trial"; end: Date }
  /** A paid period that can be paid again at any time; the urgency names the button. */
  | { kind: "renew"; end: Date; urgency: RenewUrgency };

export interface PurchaseLike {
  product_id: string;
  created_at: string;
  amount: number;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  access_expires_at?: string | null;
  /** False for a period product whose paid time ran out (listed so it can be paid again). */
  has_access?: boolean;
  period_days?: number | null;
  period_interval?: string | null;
}

export interface SubscriptionLike {
  product_id: string;
  created_at?: string | null;
  current_period_start: string;
  current_period_end: string;
  has_access: boolean;
  price: number;
  billing_period: string;
}

export interface PurchaseRowData {
  productId: string;
  /** First time the buyer paid for (or started a trial of) the product. */
  purchasedAt: Date;
  amount: number;
  access: AccessTerm;
  payment: PaymentState;
}

const SUBSCRIPTION_PERIODS: Record<string, { interval: string; days: number }> = {
  month: { interval: "1m", days: 30 },
  quarter: { interval: "3m", days: 90 },
  year: { interval: "1y", days: 365 },
};

export function renewPayment(end: Date, hasAccess: boolean, now = new Date()): PaymentState {
  if (!hasAccess || end <= now) return { kind: "renew", end, urgency: "expired" };
  const daysLeft = differenceInCalendarDays(end, now);
  return { kind: "renew", end, urgency: daysLeft <= RENEW_SOON_DAYS ? "soon" : "far" };
}

/**
 * One row per product the buyer bought. Subscriptions and period products add a purchase row
 * for every paid period, so the rows are grouped by product and the newest one decides.
 * Access that ran out stays in the list so the buyer can pay for the next period.
 */
export function buildPurchaseRows(
  purchases: PurchaseLike[],
  subscriptions: SubscriptionLike[],
  now = new Date(),
): PurchaseRowData[] {
  const byProduct = new Map<string, PurchaseLike[]>();
  for (const p of purchases) {
    const list = byProduct.get(p.product_id) ?? [];
    list.push(p);
    byProduct.set(p.product_id, list);
  }
  const subByProduct = new Map(subscriptions.map((s) => [s.product_id, s]));
  const productIds = [...new Set([...byProduct.keys(), ...subByProduct.keys()])];

  return productIds.map((productId) => {
    const rows = [...(byProduct.get(productId) ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const first = rows[0];
    const latest = rows[rows.length - 1];
    const sub = subByProduct.get(productId);

    const purchasedAt = new Date(
      first?.created_at ?? sub?.created_at ?? sub?.current_period_start ?? now.toISOString(),
    );

    if (sub) {
      const period = SUBSCRIPTION_PERIODS[sub.billing_period];
      return {
        productId,
        purchasedAt,
        amount: Number(sub.price) || Number(latest?.amount) || 0,
        access: period ? { kind: "period", ...period } : { kind: "forever" },
        payment: renewPayment(new Date(sub.current_period_end), sub.has_access, now),
      };
    }

    const base = { productId, purchasedAt, amount: Number(latest?.amount) || 0 };

    if (latest?.is_trial && latest.trial_ends_at) {
      return { ...base, access: { kind: "trial" }, payment: { kind: "trial", end: new Date(latest.trial_ends_at) } };
    }

    // A period product: the newest paid row carries the end of everything paid so far.
    if (latest?.period_days) {
      const end = latest.access_expires_at ? new Date(latest.access_expires_at) : now;
      return {
        ...base,
        access: { kind: "period", interval: latest.period_interval || "custom", days: latest.period_days },
        payment: renewPayment(end, latest.has_access !== false, now),
      };
    }

    if (latest?.access_expires_at) {
      return { ...base, access: { kind: "until", end: new Date(latest.access_expires_at) }, payment: { kind: "paid" } };
    }

    return { ...base, access: { kind: "forever" }, payment: { kind: "paid" } };
  });
}
