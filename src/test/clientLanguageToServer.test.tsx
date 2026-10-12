import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5, client side: the server can only answer in the reader's language if
// the app tells it which one that is — per device for push notifications, per
// person for email, per request for login codes and receipt errors.

const invokeApi = vi.fn();
const functionsInvoke = vi.fn();
const auth = { status: "authenticated", sessionToken: "session-1" as string | null };

vi.mock("@/lib/sessionApi", () => ({
  invokeApi: (...args: unknown[]) => invokeApi(...args),
}));

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => auth,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  },
}));

import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { useSyncProfileLanguage } from "@/hooks/useSyncProfileLanguage";
import { pushRegistrationBody } from "@/lib/firebase";
import { sendEmailCode } from "@/lib/creatorAuth";
import type { Language } from "@/lib/language";

let switchTo: (language: Language) => void = () => {};

function Probe() {
  useSyncProfileLanguage();
  const { setLanguage } = useLanguage();
  switchTo = setLanguage;
  return null;
}

function renderSync() {
  return render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
}

const setLanguageCalls = () =>
  invokeApi.mock.calls.filter(([fn, body]) => fn === "manage-profile" && body.action === "set_language");

beforeEach(() => {
  localStorage.clear();
  invokeApi.mockReset().mockResolvedValue({ ok: true });
  functionsInvoke.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  auth.status = "authenticated";
  auth.sessionToken = "session-1";
});

afterEach(() => localStorage.clear());

describe("profile language (emails)", () => {
  it("is saved after sign-in", async () => {
    localStorage.setItem("language", "en");
    renderSync();
    await act(async () => {});

    expect(setLanguageCalls()).toHaveLength(1);
    expect(setLanguageCalls()[0][1]).toMatchObject({ token: "session-1", language: "en" });
  });

  it("is saved again when the language is switched", async () => {
    renderSync();
    await act(async () => {});
    await act(async () => switchTo("kk"));

    expect(setLanguageCalls().map(([, body]) => body.language)).toEqual(["ru", "kk"]);
  });

  it("is not resent on the next page load when the server already has it", async () => {
    const first = renderSync();
    await act(async () => {});
    first.unmount();
    renderSync();
    await act(async () => {});

    expect(setLanguageCalls()).toHaveLength(1);
  });

  it("is not sent for a signed-out visitor", async () => {
    auth.status = "guest";
    auth.sessionToken = null;
    renderSync();
    await act(async () => {});

    expect(setLanguageCalls()).toHaveLength(0);
  });

  it("tries again later if the server did not take it", async () => {
    invokeApi.mockRejectedValueOnce(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = renderSync();
    await act(async () => {});
    first.unmount();
    renderSync();
    await act(async () => {});

    expect(setLanguageCalls()).toHaveLength(2);
    warn.mockRestore();
  });
});

describe("push token registration (notifications)", () => {
  it("tells the server the device's language", () => {
    expect(pushRegistrationBody("user-1", "student", "fcm-1", "en")).toMatchObject({
      action: "register",
      userId: "user-1",
      userRole: "student",
      fcmToken: "fcm-1",
      language: "en",
    });
  });

  it("registers again when the app language changes", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useFCMRegistration.ts"), "utf8");
    expect(hook).toMatch(/registerPushToken\(userId, userRole, language\)/);
    expect(hook).toMatch(/\[enabled, userId, userRole, language\]/);
  });
});

describe("one-off requests", () => {
  it("asks for the login code email in the current language", async () => {
    localStorage.setItem("language", "kk");
    await sendEmailCode("a@b.kz");

    expect(functionsInvoke).toHaveBeenCalledWith("send-email-code", {
      body: { email: "a@b.kz", language: "kk" },
    });
  });

  it("sends the language with a receipt, whose errors are shown as-is", () => {
    const card = readFileSync(resolve(process.cwd(), "src/components/checkout/ReceiptUploadCard.tsx"), "utf8");
    expect(card).toMatch(/form\.append\("language", language\)/);
  });
});
