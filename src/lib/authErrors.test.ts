import { expect, test } from "vitest";
import { authErrorKeyFromUnknown, classifyAuthError } from "./authErrors";

test("already-registered send errors are not the Google toast", () => {
  expect(classifyAuthError({ message: "User already registered" })).toBe("email_send_failed");
  expect(
    classifyAuthError({ message: "A user with this email address has already been registered" }),
  ).toBe("email_send_failed");
  expect(classifyAuthError({ message: "email already exists" })).toBe("email_send_failed");
  expect(classifyAuthError({ message: "Error sending magic link email" })).toBe(
    "email_send_failed",
  );
  expect(classifyAuthError({ message: "Edge Function returned a non-2xx status code" })).toBe(
    "email_send_failed",
  );
  expect(authErrorKeyFromUnknown({ message: "User already registered" })).toBe("emailSendFailed");
});

test("double-classified send errors still map to emailSendFailed", () => {
  const first = classifyAuthError({ message: "Failed to send code" });
  expect(first).toBe("email_send_failed");
  expect(authErrorKeyFromUnknown({ message: "Failed to send code", code: first })).toBe(
    "emailSendFailed",
  );
});

test("gotrue wait-a-minute send errors are rate limits", () => {
  expect(
    classifyAuthError({
      message: "For security purposes, you can only request this after 59 seconds.",
      status: 429,
    }),
  ).toBe("email_rate_limited");
  expect(
    authErrorKeyFromUnknown({
      message: "For security purposes, you can only request this after 59 seconds.",
    }),
  ).toBe("emailRateLimited");
});

test("exchange failure is a login retry, not Google", () => {
  expect(classifyAuthError({ message: "exchange_failed", code: "exchange_failed" })).toBe(
    "login_failed",
  );
  expect(authErrorKeyFromUnknown({ message: "exchange_failed" })).toBe("loginFailed");
});
