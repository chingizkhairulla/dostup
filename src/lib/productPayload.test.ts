import { describe, expect, it } from "vitest";
import type {
  ProductDraftFormData,
  ProductMediaItem,
} from "@/components/creator/CreatorProductsTab";
import type { CatalogCategory } from "@/lib/catalog";
import type { PricingOptionFormItem } from "@/lib/pricingOptions";
import {
  buildCommonPayload,
  buildCreatePayload,
  buildMediaPayload,
  saveKey,
  validateProductForm,
} from "@/lib/productPayload";

function option(overrides: Partial<PricingOptionFormItem> = {}): PricingOptionFormItem {
  return {
    id: "opt-1",
    paymentType: "one_time",
    price: "10000",
    recurringInterval: "1m",
    recurringCustomDays: 30,
    hasFreeTrial: false,
    trialPreset: "7",
    trialCustomDays: 7,
    kaspiMethod: "link",
    kaspiLink: "https://kaspi.kz/pay/x",
    kaspiPhone: "",
    ...overrides,
  };
}

function form(overrides: Partial<ProductDraftFormData> = {}): ProductDraftFormData {
  return {
    categoryId: "cat-1",
    subcategoryId: "sub-1",
    topic: "",
    lessonFormat: "",
    eventStartsAt: "",
    capacity: "",
    billingPeriod: "",
    title: "SAT Preparation",
    headline: "Интенсив",
    description: "Описание",
    price: "10000",
    kaspiLink: "",
    telegramLink: "",
    imageUrl: "",
    videoUrl: "",
    media: [],
    faq: [],
    isPaid: true,
    kaspiMethod: "link",
    kaspiPhone: "",
    paymentType: "one_time",
    recurringInterval: "1m",
    recurringCustomDays: 30,
    hasFreeTrial: false,
    trialPreset: "7",
    trialCustomDays: 7,
    pricingOptions: [option()],
    ...overrides,
  };
}

const categories = [
  {
    id: "cat-1",
    slug: "online-lessons",
    subcategories: [
      { id: "sub-1", slug: "group" },
      { id: "sub-2", slug: "individual" },
    ],
  },
  { id: "cat-2", slug: "materials", subcategories: [{ id: "sub-3", slug: "files" }] },
] as unknown as CatalogCategory[];

describe("validateProductForm", () => {
  it("accepts a complete form", () => {
    expect(validateProductForm(form())).toBeNull();
  });

  it("asks for a category before anything else", () => {
    expect(validateProductForm(form({ categoryId: "" }))).toBe("Выберите категорию и подкатегорию");
    expect(validateProductForm(form({ subcategoryId: "" }))).toBe("Выберите категорию и подкатегорию");
  });

  it("asks for a title", () => {
    expect(validateProductForm(form({ title: "" }))).toBe("Заполните обязательные поля");
  });

  it("asks for a price on every option of a paid product", () => {
    const bad = form({ pricingOptions: [option(), option({ id: "o2", price: "0" })] });
    expect(validateProductForm(bad)).toBe("Укажите цену для всех вариантов оплаты");
    expect(validateProductForm(form({ pricingOptions: [option({ price: "" })] }))).toBe(
      "Укажите цену для всех вариантов оплаты",
    );
  });

  it("does not ask for a price on a free product", () => {
    expect(
      validateProductForm(form({ isPaid: false, pricingOptions: [option({ price: "" })] })),
    ).toBeNull();
  });

  // The form's own submit check required these; autosave must not be looser, or
  // it would create paid products nobody can pay for.
  describe("a paid product needs a way to pay", () => {
    it("needs a payment link when the method is a link", () => {
      const bad = form({ pricingOptions: [option({ kaspiMethod: "link", kaspiLink: "  " })] });
      expect(validateProductForm(bad)).toBe("Заполните обязательные поля");
    });

    it("needs a phone number of at least 5 digits when the method is a phone", () => {
      const short = form({ pricingOptions: [option({ kaspiMethod: "phone", kaspiPhone: "+7 70" })] });
      const ok = form({ pricingOptions: [option({ kaspiMethod: "phone", kaspiPhone: "+7 701 000 00 00" })] });
      const blank = form({ pricingOptions: [option({ kaspiMethod: "phone", kaspiPhone: "" })] });
      expect(validateProductForm(short)).toBe("Заполните обязательные поля");
      expect(validateProductForm(blank)).toBe("Заполните обязательные поля");
      expect(validateProductForm(ok)).toBeNull();
    });

    it("needs a billing interval for a subscription", () => {
      const bad = form({ pricingOptions: [option({ paymentType: "recurring", recurringInterval: "" })] });
      expect(validateProductForm(bad)).toBe("Заполните обязательные поля");
    });

    it("needs at least one payment option", () => {
      expect(validateProductForm(form({ pricingOptions: [] }))).toBe("Заполните обязательные поля");
    });

    it("checks every option, not just the first", () => {
      const bad = form({ pricingOptions: [option(), option({ id: "o2", kaspiLink: "" })] });
      expect(validateProductForm(bad)).toBe("Заполните обязательные поля");
    });

    it("asks for nothing about payment on a free product", () => {
      expect(validateProductForm(form({ isPaid: false, pricingOptions: [] }))).toBeNull();
    });
  });

  it("treats a title of only spaces as missing", () => {
    expect(validateProductForm(form({ title: "   " }))).toBe("Заполните обязательные поля");
  });
});

describe("buildCommonPayload matches what create and update used to send", () => {
  it("one-time paid product", () => {
    const p = buildCommonPayload(form(), categories);
    expect(p).toMatchObject({
      title: "SAT Preparation",
      headline: "Интенсив",
      description: "Описание",
      price: 10000,
      kaspi_link: "https://kaspi.kz/pay/x",
      kaspi_phone: null,
      payment_type: "one_time",
      recurring_interval: null,
      access_duration_days: null,
      has_free_trial: false,
      trial_days: null,
    });
    expect(p.pricing_options).toEqual([
      {
        id: "opt-1",
        payment_type: "one_time",
        price: 10000,
        recurring_interval: null,
        access_duration_days: null,
        billing_period: null,
        has_free_trial: false,
        trial_days: null,
        kaspi_link: "https://kaspi.kz/pay/x",
        kaspi_phone: null,
      },
    ]);
  });

  it.each([
    ["7d", 7, "7d"],
    ["14d", 14, "14d"],
    ["1m", 30, "month"],
    ["3m", 90, "quarter"],
    ["1y", 365, "year"],
  ])("recurring %s → %i access days, billing %s", (interval, days, billing) => {
    const p = buildCommonPayload(
      form({ pricingOptions: [option({ paymentType: "recurring", recurringInterval: interval })] }),
      categories,
    );
    expect(p.payment_type).toBe("recurring");
    expect(p.recurring_interval).toBe(interval);
    expect(p.access_duration_days).toBe(days);
    expect(p.pricing_options[0]).toMatchObject({
      access_duration_days: days,
      billing_period: billing,
    });
  });

  it("custom interval uses the custom day count, falling back to 30", () => {
    const custom = (days: number) =>
      buildCommonPayload(
        form({
          pricingOptions: [
            option({ paymentType: "recurring", recurringInterval: "custom", recurringCustomDays: days }),
          ],
        }),
        categories,
      ).access_duration_days;
    expect(custom(45)).toBe(45);
    expect(custom(0)).toBe(30);
  });

  it.each([
    ["3", 3],
    ["7", 7],
    ["30", 30],
  ] as const)("trial preset %s → %i days", (preset, days) => {
    const p = buildCommonPayload(
      form({ pricingOptions: [option({ hasFreeTrial: true, trialPreset: preset })] }),
      categories,
    );
    expect(p.has_free_trial).toBe(true);
    expect(p.trial_days).toBe(days);
  });

  it("custom trial uses the custom length, falling back to 7", () => {
    const trial = (days: number) =>
      buildCommonPayload(
        form({
          pricingOptions: [option({ hasFreeTrial: true, trialPreset: "custom", trialCustomDays: days })],
        }),
        categories,
      ).trial_days;
    expect(trial(21)).toBe(21);
    expect(trial(0)).toBe(7);
  });

  it("free product: zero price, one-time, no options, no trial", () => {
    const p = buildCommonPayload(
      form({ isPaid: false, pricingOptions: [option({ hasFreeTrial: true })] }),
      categories,
    );
    expect(p).toMatchObject({
      price: 0,
      payment_type: "one_time",
      recurring_interval: null,
      access_duration_days: null,
      has_free_trial: false,
      trial_days: null,
      kaspi_link: null,
      kaspi_phone: null,
      pricing_options: [],
    });
  });

  it("phone payment method sends the phone and not the link", () => {
    const p = buildCommonPayload(
      form({ pricingOptions: [option({ kaspiMethod: "phone", kaspiPhone: "+77010000000" })] }),
      categories,
    );
    expect(p.kaspi_phone).toBe("+77010000000");
    expect(p.kaspi_link).toBeNull();
  });

  it("drops blank faq rows and trims the rest", () => {
    const p = buildCommonPayload(
      form({
        faq: [
          { question: " ", answer: "" },
          { question: " Сколько? ", answer: " Месяц " },
        ],
      }),
      categories,
    );
    expect(p.faq).toEqual([{ question: "Сколько?", answer: "Месяц" }]);
  });

  it("blank headline and description are sent as null", () => {
    const p = buildCommonPayload(form({ headline: "", description: "" }), categories);
    expect(p.headline).toBeNull();
    expect(p.description).toBeNull();
  });

  it("lesson category derives group vs individual from the subcategory", () => {
    expect(buildCommonPayload(form({ subcategoryId: "sub-1" }), categories).lesson_format).toBe("group");
    expect(buildCommonPayload(form({ subcategoryId: "sub-2" }), categories).lesson_format).toBe(
      "individual",
    );
    expect(
      buildCommonPayload(form({ categoryId: "cat-2", subcategoryId: "sub-3" }), categories).lesson_format,
    ).toBeNull();
  });

  it("always includes the taxonomy ids", () => {
    const p = buildCommonPayload(form({ topic: "SAT" }), categories);
    expect(p).toMatchObject({ category_id: "cat-1", subcategory_id: "sub-1", topic: "SAT" });
  });
});

// AC 16-17: a saved-as-you-type draft must never reach the marketplace by itself.
describe("buildCreatePayload", () => {
  it("creates the product private", () => {
    expect(buildCreatePayload(form(), categories).is_active).toBe(false);
  });

  it("carries the create-only defaults", () => {
    expect(buildCreatePayload(form(), categories)).toMatchObject({
      telegram_link: null,
      has_schedule: false,
    });
  });

  it("includes everything the common payload does", () => {
    expect(buildCreatePayload(form(), categories)).toMatchObject(buildCommonPayload(form(), categories));
  });
});

describe("buildMediaPayload", () => {
  it("takes the first image and first video as the covers", () => {
    const p = buildMediaPayload([
      { type: "video", url: "https://x/v1.mp4" },
      { type: "image", url: "https://x/i1.jpg", objectPosition: "top" },
      { type: "image", url: "https://x/i2.jpg" },
    ]);
    expect(p.image_url).toBe("https://x/i1.jpg");
    expect(p.video_url).toBe("https://x/v1.mp4");
    expect(p.media).toHaveLength(3);
    expect(p.media[1]).toEqual({ type: "image", url: "https://x/i1.jpg", objectPosition: "top" });
  });

  it("nulls the covers when there is no media", () => {
    expect(buildMediaPayload([])).toEqual({ image_url: null, video_url: null, media: [] });
  });
});

describe("saveKey", () => {
  const media = (overrides: Partial<ProductMediaItem> = {}): ProductMediaItem => ({
    id: "m1",
    type: "image",
    url: "https://x/i.jpg",
    ...overrides,
  });

  it("is identical for identical forms", () => {
    expect(saveKey(form(), categories)).toBe(saveKey(form(), categories));
  });

  it("changes when a saved field changes", () => {
    const base = saveKey(form(), categories);
    expect(saveKey(form({ title: "Другое" }), categories)).not.toBe(base);
    expect(saveKey(form({ isPaid: false }), categories)).not.toBe(base);
    expect(saveKey(form({ categoryId: "cat-2", subcategoryId: "sub-3" }), categories)).not.toBe(base);
  });

  it("changes when media is added, removed, reordered or repositioned", () => {
    const base = saveKey(form({ media: [media()] }), categories);
    expect(saveKey(form({ media: [] }), categories)).not.toBe(base);
    expect(saveKey(form({ media: [media(), media({ id: "m2", url: "https://x/2.jpg" })] }), categories)).not.toBe(base);
    expect(saveKey(form({ media: [media({ objectPosition: "top" })] }), categories)).not.toBe(base);
  });

  it("changes when an uploaded file replaces its local preview url", () => {
    const staged = saveKey(form({ media: [media({ url: "blob:local" })] }), categories);
    const uploaded = saveKey(form({ media: [media({ url: "https://x/i.jpg" })] }), categories);
    expect(staged).not.toBe(uploaded);
  });

  it("ignores fields that are never saved", () => {
    const base = saveKey(form(), categories);
    expect(saveKey(form({ telegramLink: "x", kaspiLink: "y", imageUrl: "z" }), categories)).toBe(base);
  });

  // A random fallback id would make the key differ on every call and the
  // autosave would never settle.
  it("is stable even when the form has no pricing options at all", () => {
    const empty = form({ pricingOptions: [] });
    expect(saveKey(empty, categories)).toBe(saveKey(empty, categories));
  });
});
