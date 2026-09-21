import { describe, expect, it } from "vitest";
import { draftToPreviewProduct } from "@/lib/productDraftPreview";
import type { ProductDraftFormData } from "@/components/creator/CreatorProductsTab";
import type { PricingOptionFormItem } from "@/components/creator/CreatorProductsTab";
import type { CatalogCategory } from "@/lib/catalog";

function pricingOption(overrides: Partial<PricingOptionFormItem> = {}): PricingOptionFormItem {
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
    description: "Описание курса",
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
    pricingOptions: [pricingOption()],
    ...overrides,
  };
}

const categories: CatalogCategory[] = [
  {
    id: "cat-1",
    slug: "online-lessons",
    name_ru: "Онлайн-уроки",
    name_kk: "Онлайн сабақтар",
    emoji: "📚",
    sort_order: 1,
    product_count: 0,
    subcategories: [],
  } as CatalogCategory,
];

const seller = { displayName: "SAT Academy", handle: "sat-academy", avatarUrl: null };

describe("draftToPreviewProduct", () => {
  it("passes the editable text fields straight through", () => {
    const result = draftToPreviewProduct(form(), categories, seller);

    expect(result.title).toBe("SAT Preparation");
    expect(result.headline).toBe("Интенсив");
    expect(result.description).toBe("Описание курса");
  });

  it("resolves the category slug, which the product page uses for subscription copy", () => {
    const result = draftToPreviewProduct(form(), categories, seller);
    expect(result.category_slug).toBe("online-lessons");
  });

  it("attaches the seller identity so the preview shows the real author", () => {
    const result = draftToPreviewProduct(form(), categories, seller);

    expect(result.author_name).toBe("SAT Academy");
    expect(result.seller_handle).toBe("sat-academy");
  });

  it("prefers the local blob url so unsaved media previews before upload", () => {
    const result = draftToPreviewProduct(
      form({
        media: [
          { id: "m1", type: "image", url: "", previewUrl: "blob:local-preview" },
        ],
      }),
      categories,
      seller,
    );

    expect(result.media).toEqual([
      { type: "image", url: "blob:local-preview", objectPosition: undefined },
    ]);
    expect(result.image_url).toBe("blob:local-preview");
  });

  it("drops media entries that have no usable url", () => {
    const result = draftToPreviewProduct(
      form({ media: [{ id: "m1", type: "image", url: "" }] }),
      categories,
      seller,
    );

    expect(result.media).toEqual([]);
  });

  it("drops faq rows where both question and answer are blank", () => {
    const result = draftToPreviewProduct(
      form({
        faq: [
          { question: "  ", answer: "   " },
          { question: " Сколько длится? ", answer: " 3 месяца " },
        ],
      }),
      categories,
      seller,
    );

    expect(result.faq).toEqual([{ question: "Сколько длится?", answer: "3 месяца" }]);
  });

  it("zeroes the price and clears pricing options for a free product", () => {
    const result = draftToPreviewProduct(form({ isPaid: false }), categories, seller);

    expect(result.price).toBe(0);
    expect(result.pricing_options).toEqual([]);
    expect(result.payment_type).toBe("one_time");
    expect(result.has_free_trial).toBe(false);
  });

  it("takes price and kaspi link from the first pricing option", () => {
    const result = draftToPreviewProduct(
      form({
        pricingOptions: [
          pricingOption({ price: "49000", kaspiLink: "https://kaspi.kz/pay/first" }),
          pricingOption({ id: "opt-2", price: "99000" }),
        ],
      }),
      categories,
      seller,
    );

    expect(result.price).toBe(49000);
    expect(result.kaspi_link).toBe("https://kaspi.kz/pay/first");
    expect(result.pricing_options).toHaveLength(2);
  });

  it("uses kaspi_phone instead of kaspi_link when the phone method is selected", () => {
    const result = draftToPreviewProduct(
      form({
        pricingOptions: [
          pricingOption({ kaspiMethod: "phone", kaspiPhone: "+77010000000" }),
        ],
      }),
      categories,
      seller,
    );

    expect(result.kaspi_phone).toBe("+77010000000");
    expect(result.kaspi_link).toBeNull();
  });

  describe("recurring billing", () => {
    it.each([
      ["7d", 7, "7d"],
      ["14d", 14, "14d"],
      ["1m", 30, "month"],
      ["3m", 90, "quarter"],
      ["1y", 365, "year"],
    ])("maps interval %s to %i access days", (interval, days, billingPeriod) => {
      const result = draftToPreviewProduct(
        form({
          pricingOptions: [
            pricingOption({ paymentType: "recurring", recurringInterval: interval }),
          ],
        }),
        categories,
        seller,
      );

      expect(result.access_duration_days).toBe(days);
      expect(result.billing_period).toBe(billingPeriod);
      expect(result.recurring_interval).toBe(interval);
    });

    it("uses the custom day count for a custom interval", () => {
      const result = draftToPreviewProduct(
        form({
          pricingOptions: [
            pricingOption({
              paymentType: "recurring",
              recurringInterval: "custom",
              recurringCustomDays: 45,
            }),
          ],
        }),
        categories,
        seller,
      );

      expect(result.access_duration_days).toBe(45);
    });

    it("leaves access days empty for a one-time purchase", () => {
      const result = draftToPreviewProduct(form(), categories, seller);

      expect(result.access_duration_days).toBeNull();
      expect(result.billing_period).toBeNull();
    });
  });

  describe("free trial", () => {
    it.each([
      ["3", 3],
      ["7", 7],
      ["30", 30],
    ] as const)("maps the %s day preset", (preset, days) => {
      const result = draftToPreviewProduct(
        form({
          pricingOptions: [pricingOption({ hasFreeTrial: true, trialPreset: preset })],
        }),
        categories,
        seller,
      );

      expect(result.trial_days).toBe(days);
      expect(result.has_free_trial).toBe(true);
    });

    it("uses the custom trial length when the preset is custom", () => {
      const result = draftToPreviewProduct(
        form({
          pricingOptions: [
            pricingOption({ hasFreeTrial: true, trialPreset: "custom", trialCustomDays: 21 }),
          ],
        }),
        categories,
        seller,
      );

      expect(result.trial_days).toBe(21);
    });

    it("reports no trial days when the trial is off", () => {
      const result = draftToPreviewProduct(form(), categories, seller);
      expect(result.trial_days).toBeNull();
    });
  });

  it("carries the saved product's pause state when editing an existing product", () => {
    const result = draftToPreviewProduct(form(), categories, seller, {
      id: "real-id",
      slug: "sat-prep",
      is_paused: true,
      paused_message: "Ждите новый поток",
    });

    expect(result.id).toBe("real-id");
    expect(result.slug).toBe("sat-prep");
    expect(result.is_paused).toBe(true);
    expect(result.paused_message).toBe("Ждите новый поток");
  });

  it("falls back to a placeholder id for a product that has never been saved", () => {
    const result = draftToPreviewProduct(form(), categories, seller);

    expect(result.id).toBe("preview");
    expect(result.is_paused).toBe(false);
  });

  it("tolerates a draft with no pricing options at all", () => {
    const result = draftToPreviewProduct(form({ pricingOptions: [] }), categories, seller);

    expect(result.price).toBe(0);
    expect(result.pricing_options).toEqual([]);
  });
});
