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
  const saved = serializeKaspiFields(payment);
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

test("turning transfers off clears their stored details and bank", () => {
  assert.deepEqual(serializeKaspiFields({ ...payment, kaspiMethods: ["link"], bank: "other", bankName: "Мой банк" }), {
    kaspi_link: payment.kaspiLink, kaspi_phone: null, kaspi_card: null, bank: null, bank_name: null,
  });
});
