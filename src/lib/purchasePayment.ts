import { differenceInCalendarDays } from "date-fns";

/** A subscription that ends within this many days shows «Скоро оплата». */
export const RENEW_SOON_DAYS = 7;

export type SubscriptionUrgency = "far" | "soon" | "expired";

export type PaymentState =
  /** One-time purchase with no end. */
  | { kind: "paid" }
  /** One-time purchase the seller gave an end date. */
  | { kind: "access_until"; end: Date }
  | { kind: "trial"; end: Date }
  /** Paid period of a subscription; it can be paid ahead at any time. */
  | { kind: "subscription"; end: Date; urgency: SubscriptionUrgency; daysLeft: number };

export interface PurchaseLike {
  product_id: string;
  created_at: string;
  amount: number;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  access_expires_at?: string | null;
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
  /** Set for subscriptions: month, quarter or year. */
  billingPeriod: string | null;
  payment: PaymentState;
}

export function subscriptionPayment(
  sub: Pick<SubscriptionLike, "current_period_end" | "has_access">,
  now = new Date(),
): PaymentState {
  const end = new Date(sub.current_period_end);
  const daysLeft = Math.max(0, differenceInCalendarDays(end, now));
  if (!sub.has_access || end <= now) return { kind: "subscription", end, urgency: "expired", daysLeft: 0 };
  return { kind: "subscription", end, urgency: daysLeft <= RENEW_SOON_DAYS ? "soon" : "far", daysLeft };
}

/**
 * One row per product the buyer bought. A subscription adds a purchase row for every paid
 * period, so the rows are grouped by product, and the subscription decides the payment state.
 * Subscriptions that ran out stay in the list so the buyer can pay for the next period.
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
      return {
        productId,
        purchasedAt,
        amount: Number(sub.price) || Number(latest?.amount) || 0,
        billingPeriod: sub.billing_period,
        payment: subscriptionPayment(sub, now),
      };
    }

    let payment: PaymentState = { kind: "paid" };
    if (latest?.is_trial && latest.trial_ends_at) {
      payment = { kind: "trial", end: new Date(latest.trial_ends_at) };
    } else if (latest?.access_expires_at) {
      payment = { kind: "access_until", end: new Date(latest.access_expires_at) };
    }

    return {
      productId,
      purchasedAt,
      amount: Number(latest?.amount) || 0,
      billingPeriod: null,
      payment,
    };
  });
}
