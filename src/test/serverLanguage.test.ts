import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGES as CLIENT_LANGUAGES } from "@/lib/language";
import {
  LANGUAGES,
  email,
  formatDayMonth,
  localize,
  push,
  receiptErrors,
  toLang,
  type Localized,
  type Push,
} from "../../supabase/functions/_shared/i18n.ts";

// Phase 5: text the server writes for a user — push notifications, emails and
// error messages a screen shows as-is — in the reader's language rather than
// always Russian. The edge functions run on Deno against Supabase, so what can
// be executed here is the shared message module; the wiring around it is
// guarded at the source level, the way backendContracts.test.ts does it.

const CYRILLIC = /[а-яёәіңғүұқөһ]/i;
const KAZAKH_ONLY = /[әіңғүұқөһ]/i;

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

/** Source with comments removed, so a Russian comment is not mistaken for text. */
function codeOnly(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
}

const slot = { product: "SAT Prep", date: "2026-10-05", time: "14:30" };
const move = { product: "SAT Prep", oldDate: "2026-10-05", oldTime: "14:30", newDate: "2026-10-06", newTime: "15:00" };

const EVERY_PUSH: Record<string, Localized<Push>> = {
  newBooking: push.newBooking({ ...slot, student: "Aru" }),
  bookingCancelled: push.bookingCancelled({ ...slot, student: "Aru", note: '"заболел"' }),
  lessonCancelledByTeacher: push.lessonCancelledByStaff({ ...slot, by: "teacher" }),
  lessonCancelledByAuthor: push.lessonCancelledByStaff({ ...slot, by: "creator" }),
  newPayment: push.newPayment({ student: "Aru", product: "SAT Prep", amount: 5000 }),
  paymentConfirmed: push.paymentConfirmed({ product: "SAT Prep" }),
  lessonRescheduled: push.lessonRescheduled({ ...move, reason: "Болезнь" }),
  requestFromStudent: push.rescheduleRequestFromStudent({ ...move, student: "Aru" }),
  requestFromTeacher: push.rescheduleRequestFromTeacher(move),
  answeredYes: push.rescheduleAnswered({ ...move, approved: true }),
  answeredNo: push.rescheduleAnswered({ ...move, approved: false }),
  studentSaidYes: push.rescheduleAnsweredByStudent({ ...move, approved: true, student: "Aru" }),
  studentSaidNo: push.rescheduleAnsweredByStudent({ ...move, approved: false, student: "Aru" }),
  oneMaterial: push.materialsUnlocked({ product: "SAT Prep", titles: ["Unit 1"] }),
  manyMaterials: push.materialsUnlocked({ product: "SAT Prep", titles: ["Unit 1", "Unit 2", "Unit 3"] }),
  reminder24hStaff: push.reminder({ ...slot, kind: "24h", staff: true }),
  reminder24hStudent: push.reminder({ ...slot, kind: "24h", staff: false }),
  reminder2hStaff: push.reminder({ ...slot, kind: "2h", staff: true }),
  reminder2hStudent: push.reminder({ ...slot, kind: "2h", staff: false }),
  subscriptionRenewal: push.subscriptionRenewal({ product: "SAT Prep", periodEnd: "2026-10-08T00:00:00.000Z" }),
};

describe("the server speaks the same languages as the app", () => {
  it("lists exactly the client's languages, in the same order", () => {
    expect([...LANGUAGES]).toEqual(CLIENT_LANGUAGES.map((entry) => entry.code));
  });

  it("treats anything unknown as Russian, today's behaviour", () => {
    expect(toLang("en")).toBe("en");
    expect(toLang("kk")).toBe("kk");
    expect(toLang(undefined)).toBe("ru");
    expect(toLang("de")).toBe("ru");
    expect(localize({ ru: "р", kk: "к", en: "e" }, null)).toBe("р");
  });
});

describe("push notifications", () => {
  it.each(Object.entries(EVERY_PUSH))("%s has a title and a body in every language", (_name, message) => {
    for (const lang of LANGUAGES) {
      expect(message[lang].title.trim()).not.toBe("");
      expect(message[lang].body.trim()).not.toBe("");
    }
  });

  it.each(Object.entries(EVERY_PUSH))("%s: English carries no Russian of its own", (_name, message) => {
    // The one deliberate exception is the user's own words (a cancellation
    // note, a reschedule reason), which are passed through as written.
    const ownWords = /"заболел"|Болезнь/g;
    expect(message.en.title).not.toMatch(CYRILLIC);
    expect(message.en.body.replace(ownWords, "")).not.toMatch(CYRILLIC);
  });

  it.each(Object.entries(EVERY_PUSH))("%s: Kazakh is not just the Russian text", (_name, message) => {
    expect(message.kk.title + message.kk.body).not.toBe(message.ru.title + message.ru.body);
  });

  it("Russian keeps the wording users already know", () => {
    expect(EVERY_PUSH.newBooking.ru).toEqual({
      title: "Новая запись!",
      body: 'Aru записался на "SAT Prep" на 2026-10-05 в 14:30',
    });
    expect(EVERY_PUSH.paymentConfirmed.ru.title).toBe("Оплата подтверждена!");
    expect(EVERY_PUSH.reminder2hStudent.ru.body).toBe('"SAT Prep" начнётся через 2 часа');
  });

  it("names a missing student and product in the reader's language", () => {
    const message = push.newBooking({ student: null, product: null, date: "2026-10-05", time: "14:30" });
    expect(message.ru.body).toMatch(/^Ученик записался на "продукт"/);
    expect(message.en.body).toMatch(/^A student booked "the product"/);
    expect(message.kk.body).toMatch(/^Оқушы/);
  });

  it("counts materials with the right Russian form (the old text always said «материала»)", () => {
    const count = (n: number) =>
      push.materialsUnlocked({ product: "P", titles: Array.from({ length: n }, (_, i) => `M${i}`) }).ru.body;
    expect(count(2)).toMatch(/^2 новых материала доступны/);
    expect(count(5)).toMatch(/^5 новых материалов доступны/);
    expect(count(21)).toMatch(/^21 новый материал доступен/);
    expect(push.materialsUnlocked({ product: "P", titles: ["A", "B"] }).en.body).toBe(
      '2 new materials are available in "P"',
    );
  });

  it("writes reminder dates in the reader's language", () => {
    expect(formatDayMonth("2026-10-05", "en")).toBe("5 October");
    expect(formatDayMonth("2026-10-05", "ru")).toBe("5 октября");
    expect(EVERY_PUSH.reminder24hStudent.en.body).toBe('"SAT Prep" is on 5 October at 14:30');
  });
});

describe("emails", () => {
  it.each(LANGUAGES)("the %s login code email carries the code and no prefetchable link", (lang) => {
    const message = email.loginCode("424242", lang);
    expect(message.subject).toContain("424242");
    expect(message.html).toContain("424242");
    expect(message.html).not.toMatch(/confirmationurl|\/auth\/v1\/verify|token_hash/i);
  });

  it("the English login email is English", () => {
    const message = email.loginCode("424242", "en");
    expect(message.subject + message.html).not.toMatch(CYRILLIC);
    expect(email.loginCode("424242", "kk").html).toMatch(KAZAKH_ONLY);
  });

  it("the renewal email is in the requested language and escapes the product title", () => {
    const args = { product: "<b>SAT</b>", periodEnd: "2026-10-08T00:00:00.000Z", paymentUrl: "https://trydostup.online/checkout/sat" };
    const en = email.subscriptionRenewal(args, "en");
    expect(en.subject).toBe("Subscription renewal coming up");
    expect(en.html).toContain("8 October 2026");
    expect(en.html).toContain("&lt;b&gt;SAT&lt;/b&gt;");
    expect(en.html).not.toContain("<b>SAT</b>");
    expect(en.subject + en.html).not.toMatch(CYRILLIC);
    expect(email.subscriptionRenewal(args, "ru").html).toContain("Здравствуйте!");
  });
});

describe("receipt upload errors (shown to the buyer as-is)", () => {
  it.each(Object.entries(receiptErrors))("%s exists in every language", (_code, text) => {
    for (const lang of LANGUAGES) expect(text[lang].trim()).not.toBe("");
    expect(text.en).not.toMatch(CYRILLIC);
    expect(text.kk).not.toBe(text.ru);
  });
});

// ---------------------------------------------------------------------------
// Wiring. These read the edge functions' source, since they cannot run here.
// ---------------------------------------------------------------------------

/** Every function that writes user-facing text, now without Russian literals. */
const LOCALIZED_FUNCTIONS = [
  "notify-booking-change",
  "notify-purchase-change",
  "notify-reschedule",
  "notify-reschedule-request",
  "notify-reschedule-response",
  "unlock-materials",
  "send-reminders",
  "process-subscriptions",
  "submit-payment-receipt",
  "send-email-code",
];

/** Functions that send FCM messages themselves, token by token. */
const PER_TOKEN_SENDERS = [
  "notify-booking-change",
  "notify-purchase-change",
  "notify-reschedule",
  "notify-reschedule-request",
  "notify-reschedule-response",
  "unlock-materials",
  "send-push-notification",
];

describe("edge functions use the shared messages", () => {
  // Russian that is data, not text for a reader: changing it would change a
  // contract with other code, not a translation.
  const DATA_NOT_TEXT = [
    // A marker manage-bookings writes into reasons[]; notify-reschedule skips on it.
    'record.reasons?.includes("Запрос ученика подтверждён")',
    // The stored product_title of a material_unlocks row for a product with no title.
    'productTitleMap[m.product_id] || "Продукт"',
  ];

  it.each(LOCALIZED_FUNCTIONS)("%s has no Russian text of its own left", (name) => {
    const code = codeOnly(readRepoFile(`supabase/functions/${name}/index.ts`));
    const russianLines = code
      .split("\n")
      .filter((line) => CYRILLIC.test(line))
      .filter((line) => !DATA_NOT_TEXT.some((allowed) => line.includes(allowed)));
    expect(russianLines).toEqual([]);
  });

  it("the login email helper takes its wording from the shared module", () => {
    expect(codeOnly(readRepoFile("supabase/functions/_shared/email-otp.ts"))).not.toMatch(CYRILLIC);
  });

  it.each(PER_TOKEN_SENDERS)("%s reads each device's language and localizes per token", (name) => {
    const code = readRepoFile(`supabase/functions/${name}/index.ts`);
    const tokenSelects = code.match(/\.select\("id, fcm_token[^"]*"\)/g) ?? [];
    expect(tokenSelects.length).toBeGreaterThan(0);
    for (const select of tokenSelects) expect(select).toContain("language");
    expect(code).toMatch(/localize\([^)]*tokenRecord\.language\)/);
  });

  it("devices register with their language", () => {
    const code = readRepoFile("supabase/functions/manage-push-token/index.ts");
    expect(code).toMatch(/language:\s*toLang\(language\)/);
  });

  it("manage-profile can store the person's language on all their profiles", () => {
    const code = readRepoFile("supabase/functions/manage-profile/index.ts");
    const start = code.indexOf("action === 'set_language'");
    expect(start).toBeGreaterThan(-1);
    const action = code.slice(start, start + 600);
    expect(action).toMatch(/isLanguage\(body\.language\)/);
    expect(action).toMatch(/\.eq\('auth_user_id', authUserId\)/);
  });

  it("callers of send-push-notification keep sending Russian title/body for an older deploy", () => {
    for (const name of ["send-reminders", "process-subscriptions"]) {
      const code = readRepoFile(`supabase/functions/${name}/index.ts`);
      expect(code, name).toMatch(/localized/);
      expect(code, name).toMatch(/localized\.ru/);
    }
  });
});

describe("the migration", () => {
  const sql = readRepoFile("supabase/migrations/20261003120000_recipient_language.sql");
  const statements = sql.replace(/--.*$/gm, "");

  it("adds a language column to profiles and push_tokens, defaulting to Russian", () => {
    expect(statements).toMatch(
      /ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ru'/,
    );
    expect(statements).toMatch(
      /ALTER TABLE public\.push_tokens\s+ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ru'/,
    );
  });

  it("allows exactly the three languages", () => {
    const checks = statements.match(/CHECK \(language IN \(([^)]*)\)\)/g) ?? [];
    expect(checks).toHaveLength(2);
    for (const check of checks) expect(check).toContain("'ru', 'kk', 'en'");
  });

  it("is additive and safe to re-run", () => {
    expect(statements).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
    expect((statements.match(/IF NOT EXISTS/g) ?? []).length).toBe(4);
  });
});
