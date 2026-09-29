import { test } from "node:test";
import assert from "node:assert/strict";
import { cardDigits, formatCardNumber, isCardNumberComplete } from "./paymentFormat.ts";

test("card number is grouped in fours as it is typed", () => {
  assert.equal(formatCardNumber(""), "");
  assert.equal(formatCardNumber("4"), "4");
  assert.equal(formatCardNumber("4400"), "4400");
  assert.equal(formatCardNumber("44004"), "4400 4");
  assert.equal(formatCardNumber("4400430212345678"), "4400 4302 1234 5678");
});

test("separators and letters in pasted numbers are ignored", () => {
  assert.equal(formatCardNumber("4400-4302-1234-5678"), "4400 4302 1234 5678");
  assert.equal(formatCardNumber("4400 4302 1234 5678"), "4400 4302 1234 5678");
  assert.equal(formatCardNumber("abc4400def4302"), "4400 4302");
});

test("input is capped at the longest real card length", () => {
  // 19 digits is Maestro; a 25-digit paste must not grow the field forever.
  assert.equal(formatCardNumber("1".repeat(25)), "1111 1111 1111 1111 111");
  assert.equal(cardDigits("1".repeat(25)).length, 19);
});

test("completeness accepts 12 to 19 digits", () => {
  assert.equal(isCardNumberComplete("4400 4302 1234"), true);
  assert.equal(isCardNumberComplete("4400 4302 123"), false);
  assert.equal(isCardNumberComplete("4400 4302 1234 5678"), true);
  assert.equal(isCardNumberComplete(""), false);
});

test("clipboard gets digits only, since banks reject spaces", () => {
  assert.equal(cardDigits("4400 4302 1234 5678"), "4400430212345678");
});
