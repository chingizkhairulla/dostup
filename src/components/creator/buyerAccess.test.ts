import { test } from "node:test";
import assert from "node:assert/strict";
import { accessUrgency, periodStart } from "./buyerAccess.ts";

const now = new Date("2026-09-24T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
const paid = { status: "completed", created_at: "2026-09-01T10:00:00Z" };

test("access with no end date is forever; a closed one is closed", () => {
  assert.equal(accessUrgency(paid, now).urgency, "forever");
  assert.equal(accessUrgency({ ...paid, status: "revoked", access_expires_at: inDays(30) }, now).urgency, "closed");
});

test("urgency follows the days left: far, soon, very soon, expired", () => {
  assert.equal(accessUrgency({ ...paid, access_expires_at: inDays(40) }, now).urgency, "far");
  assert.equal(accessUrgency({ ...paid, access_expires_at: inDays(10) }, now).urgency, "soon");
  assert.equal(accessUrgency({ ...paid, access_expires_at: inDays(2) }, now).urgency, "very_soon");
  assert.equal(accessUrgency({ ...paid, access_expires_at: inDays(-1) }, now).urgency, "expired");
});

test("a subscription's period end wins, and a far-future end reads as forever", () => {
  const sub = { current_period_end: inDays(3), status: "active" };
  assert.equal(accessUrgency({ ...paid, access_expires_at: null, subscription: sub }, now).urgency, "very_soon");
  const endless = { current_period_end: "2999-12-31T00:00:00.000Z", status: "active" };
  assert.equal(accessUrgency({ ...paid, subscription: endless }, now).urgency, "forever");
});

test("period filter starts this month by default and presets count from payment", () => {
  assert.equal(periodStart("month", now)?.getDate(), 1);
  assert.equal(periodStart("all", now), null);
});
