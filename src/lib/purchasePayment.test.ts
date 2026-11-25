import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPurchaseRows, renewPayment } from "./purchasePayment.ts";

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

const urgency = (state: ReturnType<typeof renewPayment>) => (state.kind === "renew" ? state.urgency : null);

test("renew urgency: far, soon within a week, expired", () => {
  assert.equal(urgency(renewPayment(new Date(inDays(20)), true, now)), "far");
  assert.equal(urgency(renewPayment(new Date(inDays(5)), true, now)), "soon");
  assert.equal(urgency(renewPayment(new Date(inDays(-1)), false, now)), "expired");
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
  assert.deepEqual(rows[0].access, { kind: "period", interval: "1m", days: 30 });
  assert.equal(rows[0].payment.kind === "renew" && rows[0].payment.urgency, "soon");
});

test("one-time purchases: forever, seller end date, trial", () => {
  const rows = buildPurchaseRows(
    [
      { product_id: "a", created_at: inDays(-5), amount: 15000 },
      { product_id: "b", created_at: inDays(-5), amount: 9000, access_expires_at: inDays(10) },
      { product_id: "c", created_at: inDays(-1), amount: 0, is_trial: true, trial_ends_at: inDays(6) },
    ],
    [],
    now,
  );
  const row = (id: string) => rows.find((r) => r.productId === id)!;
  assert.equal(row("a").access.kind, "forever");
  assert.equal(row("a").payment.kind, "paid");
  assert.equal(row("b").access.kind, "until");
  assert.equal(row("b").payment.kind, "paid");
  assert.equal(row("c").access.kind, "trial");
  assert.equal(row("c").payment.kind, "trial");
});

test("a period product shows its days and can be paid again, the newest row decides", () => {
  const rows = buildPurchaseRows(
    [
      { product_id: "p", created_at: inDays(-50), amount: 4000, period_days: 45, period_interval: "custom", access_expires_at: inDays(-5) },
      { product_id: "p", created_at: inDays(-6), amount: 4000, period_days: 45, period_interval: "custom", access_expires_at: inDays(40) },
    ],
    [],
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].purchasedAt.toISOString(), inDays(-50));
  assert.deepEqual(rows[0].access, { kind: "period", interval: "custom", days: 45 });
  assert.equal(rows[0].payment.kind === "renew" && rows[0].payment.urgency, "far");
});

test("a period product whose time ran out is overdue", () => {
  const rows = buildPurchaseRows(
    [{ product_id: "p", created_at: inDays(-20), amount: 4000, period_days: 14, period_interval: "14d", access_expires_at: inDays(-6), has_access: false }],
    [],
    now,
  );
  assert.equal(rows[0].payment.kind === "renew" && rows[0].payment.urgency, "expired");
});

test("an expired subscription with no purchase rows still gets a row", () => {
  const rows = buildPurchaseRows([], [sub(inDays(-3), false)], now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payment.kind === "renew" && rows[0].payment.urgency, "expired");
});
