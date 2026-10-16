import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPurchaseRows, subscriptionPayment } from "./purchasePayment.ts";

const now = new Date("2026-10-16T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

const sub = (end: string, hasAccess = true) => ({
  product_id: "sub",
  current_period_start: inDays(-30),
  current_period_end: end,
  has_access: hasAccess,
  price: 5000,
  billing_period: "month",
});

test("subscription urgency: far, soon within a week, expired", () => {
  assert.equal(subscriptionPayment(sub(inDays(20)), now).kind, "subscription");
  const far = subscriptionPayment(sub(inDays(20)), now);
  const soon = subscriptionPayment(sub(inDays(5)), now);
  const ended = subscriptionPayment(sub(inDays(-1), false), now);
  assert.equal(far.kind === "subscription" && far.urgency, "far");
  assert.equal(soon.kind === "subscription" && soon.urgency, "soon");
  assert.equal(ended.kind === "subscription" && ended.urgency, "expired");
});

test("renewals collapse into one row dated by the first payment", () => {
  const rows = buildPurchaseRows(
    [
      { product_id: "sub", created_at: inDays(-60), amount: 5000 },
      { product_id: "sub", created_at: inDays(-30), amount: 5000 },
    ],
    [sub(inDays(3))],
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].purchasedAt.toISOString(), inDays(-60));
  assert.equal(rows[0].billingPeriod, "month");
  assert.equal(rows[0].payment.kind === "subscription" && rows[0].payment.urgency, "soon");
});

test("one-time purchases: lifetime, seller end date, trial", () => {
  const rows = buildPurchaseRows(
    [
      { product_id: "a", created_at: inDays(-5), amount: 15000 },
      { product_id: "b", created_at: inDays(-5), amount: 9000, access_expires_at: inDays(10) },
      { product_id: "c", created_at: inDays(-1), amount: 0, is_trial: true, trial_ends_at: inDays(6) },
    ],
    [],
    now,
  );
  const kind = (id: string) => rows.find((r) => r.productId === id)?.payment.kind;
  assert.equal(kind("a"), "paid");
  assert.equal(kind("b"), "access_until");
  assert.equal(kind("c"), "trial");
});

test("an expired subscription with no purchase rows still gets a row", () => {
  const rows = buildPurchaseRows([], [sub(inDays(-3), false)], now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payment.kind === "subscription" && rows[0].payment.urgency, "expired");
});
