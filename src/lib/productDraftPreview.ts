import type {
  PricingOptionFormItem,
  ProductDraftFormData,
} from "@/components/creator/CreatorProductsTab";
import type { Product, ProductPricingOption } from "@/hooks/useProducts";
import type { CatalogCategory } from "@/lib/catalog";

const INTERVAL_DAYS: Record<string, number> = {
  "7d": 7,
  "14d": 14,
  "1m": 30,
  "3m": 90,
  "1y": 365,
};

const INTERVAL_BILLING: Record<string, string> = {
  "1m": "month",
  "3m": "quarter",
  "1y": "year",
};

function accessDays(opt: PricingOptionFormItem): number | null {
  if (opt.paymentType !== "recurring") return null;
  if (opt.recurringInterval === "custom") return opt.recurringCustomDays || 30;
  return INTERVAL_DAYS[opt.recurringInterval] ?? null;
}

function trialDays(opt: PricingOptionFormItem): number | null {
  if (!opt.hasFreeTrial) return null;
  if (opt.trialPreset === "custom") return opt.trialCustomDays || 7;
  return Number(opt.trialPreset) || null;
}

function toPricingOption(opt: PricingOptionFormItem): ProductPricingOption {
  return {
    id: opt.id,
    payment_type: opt.paymentType,
    price: Number(opt.price) || 0,
    recurring_interval: opt.paymentType === "recurring" ? opt.recurringInterval : null,
    has_free_trial: opt.hasFreeTrial,
    trial_days: trialDays(opt),
    kaspi_link: opt.kaspiMethod === "link" ? opt.kaspiLink || null : null,
    kaspi_phone: opt.kaspiMethod === "phone" ? opt.kaspiPhone || null : null,
  };
}

export type DraftPreviewSeller = {
  displayName?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
};

export type DraftPreviewBase = {
  id?: string | null;
  slug?: string | null;
  has_schedule?: boolean;
  is_paused?: boolean;
  paused_message?: string | null;
};

/**
 * Maps unsaved editor state onto the product shape the product page renders, so
 * the live preview never needs the draft to be written to the database.
 */
export function draftToPreviewProduct(
  form: ProductDraftFormData,
  categories: CatalogCategory[],
  seller: DraftPreviewSeller,
  base?: DraftPreviewBase | null,
): Product {
  const options =
    form.pricingOptions && form.pricingOptions.length > 0 ? form.pricingOptions : [];
  const primary = options[0];
  const paid = form.isPaid && Boolean(primary);

  const media = (form.media || [])
    .map((item) => ({
      type: item.type,
      url: item.previewUrl || item.url || "",
      objectPosition: item.objectPosition,
    }))
    .filter((item) => item.url);

  const firstImage = media.find((item) => item.type === "image");
  const firstVideo = media.find((item) => item.type === "video");
  const category = categories.find((item) => item.id === form.categoryId);

  return {
    id: base?.id || "preview",
    creator_id: "preview",
    title: form.title || "",
    headline: form.headline || null,
    description: form.description || null,
    price: paid ? Number(primary.price) || 0 : 0,
    image_url: firstImage?.url || form.imageUrl || null,
    video_url: firstVideo?.url || form.videoUrl || null,
    media,
    has_schedule: base?.has_schedule ?? false,
    is_active: true,
    slug: base?.slug || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    kaspi_link: paid && primary.kaspiMethod === "link" ? primary.kaspiLink || null : null,
    kaspi_phone: paid && primary.kaspiMethod === "phone" ? primary.kaspiPhone || null : null,
    telegram_link: null,
    faq: (form.faq || [])
      .filter((item) => (item?.question || "").trim() || (item?.answer || "").trim())
      .map((item) => ({
        question: (item?.question || "").trim(),
        answer: (item?.answer || "").trim(),
      })),
    access_duration_days: paid ? accessDays(primary) : null,
    is_paused: base?.is_paused ?? false,
    paused_message: base?.paused_message ?? null,
    author_name: seller.displayName || null,
    seller_handle: seller.handle || null,
    seller_avatar_url: seller.avatarUrl || null,
    category_id: form.categoryId || undefined,
    subcategory_id: form.subcategoryId || undefined,
    category_slug: category?.slug || null,
    lesson_format: form.lessonFormat || null,
    billing_period:
      paid && primary.paymentType === "recurring"
        ? INTERVAL_BILLING[primary.recurringInterval] ?? primary.recurringInterval
        : null,
    payment_type: paid ? primary.paymentType : "one_time",
    recurring_interval:
      paid && primary.paymentType === "recurring" ? primary.recurringInterval : null,
    has_free_trial: paid ? primary.hasFreeTrial : false,
    trial_days: paid ? trialDays(primary) : null,
    pricing_options: paid ? options.map(toPricingOption) : [],
  };
}
