import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePaymentMethods, serializeKaspiFields, type PaymentMethodFormValue } from "./paymentMethods.ts";

const payment: PaymentMethodFormValue = {
  kaspiMethods: ["phone"],
  kaspiLink: "https://example.com/pay",
  kaspiPhone: "+7 700 000 00-00",
  kaspiCard: "1234 5678 9012 3456",
  bank: "halyk",
  bankName: "",
};

test("phone transfers keep the selected bank through saving and checkout", () => {
  const saved = serializeKaspiFields({ ...payment, kaspiLink: "", kaspiCard: "" });
  assert.equal(saved.bank, "halyk");
  assert.equal(saved.kaspi_card, null);
  assert.equal(saved.kaspi_link, null);
  const resolved = resolvePaymentMethods(saved, null);
  assert.equal(resolved.phone, payment.kaspiPhone);
  assert.equal(resolved.bankLabel, "Halyk");
});

test("a custom bank is preserved for phone transfers", () => {
  const saved = serializeKaspiFields({ ...payment, bank: "other", bankName: "  Мой банк  " });
  assert.equal(resolvePaymentMethods(saved, null).bankLabel, "Мой банк");
});

test("existing combined phone, card and link options remain supported", () => {
  const saved = serializeKaspiFields({ ...payment, kaspiMethods: ["link", "phone", "card"] });
  const resolved = resolvePaymentMethods(saved, null);
  assert.equal(resolved.link, payment.kaspiLink);
  assert.equal(resolved.phone, payment.kaspiPhone);
  assert.equal(resolved.card, "1234567890123456");
  assert.equal(resolved.bank, "halyk");
});

test("switching to a link keeps previously entered transfer details", () => {
  const saved = serializeKaspiFields({ ...payment, kaspiMethods: ["link"], paymentMethod: "link", lastPaymentMethod: "phone" });
  assert.equal(saved.kaspi_link, payment.kaspiLink);
  assert.equal(saved.kaspi_phone, payment.kaspiPhone);
  assert.equal(saved.kaspi_card, "1234567890123456");
  assert.equal(saved.last_payment_method, "phone");
});

test("empty fields are removed deliberately without clearing other methods", () => {
  const saved = serializeKaspiFields({ ...payment, kaspiPhone: "", kaspiCard: "", lastPaymentMethod: "phone" });
  assert.equal(saved.kaspi_link, payment.kaspiLink);
  assert.equal(saved.kaspi_phone, null);
  assert.equal(saved.kaspi_card, null);
  assert.equal(saved.last_payment_method, "link");
});

test("a bank entered before transfer details survives saving", () => {
  const saved = serializeKaspiFields({ ...payment, kaspiLink: "", kaspiPhone: "", kaspiCard: "", bank: "other", bankName: "  Мой банк  " });
  assert.equal(saved.bank, "other");
  assert.equal(saved.bank_name, "Мой банк");
});
