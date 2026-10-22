import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaymentDetailsUpdate, createDefaultPricingOption, kaspiSettingsFromStored, serializePricingOption } from "./paymentEditor.ts";

const option = { ...createDefaultPricingOption("monthly"), kaspiLink: "https://example.com/pay", lastPaymentMethod: "link" as const };
const stored = { price: 49000, pricing_options: [serializePricingOption(option)] };

test("a new product opens transfer and phone by default", () => {
  const defaults = createDefaultPricingOption();
  assert.equal(defaults.paymentMethod, "phone");
  assert.equal(defaults.lastPaymentMethod, "phone");
});

test("a legacy link-only product opens the link", () => {
  assert.equal(kaspiSettingsFromStored({ kaspi_link: "https://example.com/pay" }).lastMethod, "link");
});

test("the last edited field is restored when multiple methods are filled", () => {
  const saved = serializePricingOption({ ...option, kaspiPhone: "+7 700 000 00-00", kaspiCard: "1111222233334444", paymentMethod: "card" });
  assert.equal(kaspiSettingsFromStored(saved).lastMethod, "link");
});

test("explicitly cleared fields do not reappear from legacy product fields", () => {
  const result = kaspiSettingsFromStored({ kaspi_link: null, kaspi_phone: null, last_payment_method: "phone" }, { kaspi_link: "https://example.com/old" });
  assert.equal(result.link, "");
  assert.equal(result.lastMethod, "phone");
});

test("opening another tab without editing does not write to the product", () => {
  assert.equal(buildPaymentDetailsUpdate(stored, [option], [{ ...option, paymentMethod: "phone" }]), null);
});

test("autosave retains hidden fields and leaves price, trial and custom tariff properties intact", () => {
  const original = { ...stored, pricing_options: [{ ...stored.pricing_options[0], name: "Тариф", has_free_trial: true, trial_days: 3 }] };
  const updates = buildPaymentDetailsUpdate(original, [option], [{ ...option, kaspiPhone: "+7 700 000 00-00", lastPaymentMethod: "phone", paymentMethod: "link", price: "1", hasFreeTrial: false }])!;
  assert.equal(updates.kaspi_link, option.kaspiLink);
  assert.equal(updates.kaspi_phone, "+7 700 000 00-00");
  assert.equal(updates.pricing_options[0].price, 49000);
  assert.equal(updates.pricing_options[0].name, "Тариф");
  assert.equal(updates.pricing_options[0].has_free_trial, true);
  assert.equal(updates.pricing_options[0].trial_days, 3);
  assert.equal(updates.pricing_options[0].last_payment_method, "phone");
  assert.deepEqual(Object.keys(updates).sort(), ["kaspi_link", "kaspi_phone", "pricing_options"]);
});

test("closing the editor without Save does not remove existing tariffs", () => {
  const second = { ...option, id: "annual", price: "90000" };
  const original = { ...stored, pricing_options: [serializePricingOption(option), serializePricingOption(second)] };
  const updates = buildPaymentDetailsUpdate(original, [option, second], [{ ...option, kaspiPhone: "+7 700 000 00-00" }])!;
  assert.equal(updates.pricing_options.length, 2);
  assert.deepEqual(updates.pricing_options[1], original.pricing_options[1]);
});

test("entered details in a new tariff survive closing the editor", () => {
  const second = { ...createDefaultPricingOption("second"), kaspiPhone: "+7 700 000 00-00" };
  const updates = buildPaymentDetailsUpdate(stored, [option], [option, second])!;
  assert.equal(updates.pricing_options.length, 2);
  assert.equal(updates.pricing_options[1].kaspi_phone, second.kaspiPhone);
});

test("an incomplete new tariff keeps the editor open instead of publishing a zero price", () => {
  const second = { ...createDefaultPricingOption("second"), price: "", kaspiPhone: "+7 700 000 00-00" };
  assert.throws(() => buildPaymentDetailsUpdate(stored, [option], [option, second]), /Укажите цену/);
});

test("legacy products receive matching tariff and product fields when details change", () => {
  const updates = buildPaymentDetailsUpdate({ price: 49000, kaspi_link: option.kaspiLink }, [option], [{ ...option, kaspiPhone: "+7 700 000 00-00", lastPaymentMethod: "phone" }])!;
  assert.equal(updates.pricing_options[0].id, option.id);
  assert.equal(updates.pricing_options[0].kaspi_phone, updates.kaspi_phone);
});
