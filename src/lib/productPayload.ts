import type {
  ProductDraftFormData,
  ProductMediaItem,
} from "@/components/creator/CreatorProductsTab";
import type { CatalogCategory } from "@/lib/catalog";
import {
  accessDaysFor,
  billingPeriodFor,
  createDefaultPricingOption,
  trialDaysFor,
  type PricingOptionFormItem,
} from "@/lib/pricingOptions";

// The fallback option needs a fixed id: a random one would make every call
// produce a different payload, so saveKey() would never settle and the
// autosave would keep saving forever.
function optionsOf(form: ProductDraftFormData): PricingOptionFormItem[] {
  return form.pricingOptions && form.pricingOptions.length > 0
    ? form.pricingOptions
    : [createDefaultPricingOption("default")];
}

export function validateTaxonomyFields(form: ProductDraftFormData): string | null {
  if (!form.categoryId || !form.subcategoryId) {
    return "Выберите категорию и подкатегорию";
  }
  return null;
}

export function buildTaxonomyPayload(form: ProductDraftFormData, categories: CatalogCategory[]) {
  const currentCategory = categories.find((c) => c.id === form.categoryId);
  const currentSubcategory = currentCategory?.subcategories.find((s) => s.id === form.subcategoryId);
  const isLessons = currentCategory?.slug === "online-lessons";

  return {
    category_id: form.categoryId,
    subcategory_id: form.subcategoryId,
    lesson_format: isLessons ? (currentSubcategory?.slug === "group" ? "group" : "individual") : null,
    event_starts_at: null,
    capacity: null,
    billing_period: null,
    topic: form.topic || null,
  };
}

function paymentDetailsMissing(opt: PricingOptionFormItem): boolean {
  if (opt.paymentType === "recurring" && !opt.recurringInterval) return true;
  if (opt.kaspiMethod === "link") return !opt.kaspiLink?.trim();
  const digits = opt.kaspiPhone?.replace(/\D/g, "") || "";
  return !opt.kaspiPhone?.trim() || digits.length < 5;
}

/**
 * The first problem that stops a product from being saved, or null when it can be.
 * This has to be as strict as the form's own submit check: with autosave there is
 * no Save click to stop a paid product that nobody can actually pay for.
 */
export function validateProductForm(form: ProductDraftFormData): string | null {
  const taxonomyError = validateTaxonomyFields(form);
  if (!form.title?.trim() || taxonomyError) {
    return taxonomyError || "Заполните обязательные поля";
  }
  if (form.isPaid) {
    const options = form.pricingOptions ?? [];
    if (options.length === 0) return "Заполните обязательные поля";
    if (options.some((o) => !o.price || Number(o.price) <= 0)) {
      return "Укажите цену для всех вариантов оплаты";
    }
    if (options.some(paymentDetailsMissing)) return "Заполните обязательные поля";
  }
  return null;
}

function serializeOption(opt: PricingOptionFormItem) {
  return {
    id: opt.id,
    payment_type: opt.paymentType,
    price: Number(opt.price) || 0,
    recurring_interval: opt.paymentType === "recurring" ? opt.recurringInterval : null,
    access_duration_days: accessDaysFor(opt),
    billing_period: billingPeriodFor(opt),
    has_free_trial: opt.hasFreeTrial,
    trial_days: trialDaysFor(opt),
    kaspi_link: opt.kaspiMethod === "link" ? opt.kaspiLink || null : null,
    kaspi_phone: opt.kaspiMethod === "phone" ? opt.kaspiPhone || null : null,
  };
}

/** Everything both creating and updating a product send, straight from the form. */
export function buildCommonPayload(form: ProductDraftFormData, categories: CatalogCategory[]) {
  const options = optionsOf(form);
  const primary = options[0];
  const paid = form.isPaid;

  return {
    title: form.title,
    headline: form.headline || null,
    description: form.description || null,
    price: paid ? Number(primary.price) : 0,
    kaspi_link: paid && primary.kaspiMethod === "link" ? primary.kaspiLink || null : null,
    kaspi_phone: paid && primary.kaspiMethod === "phone" ? primary.kaspiPhone || null : null,
    payment_type: paid ? primary.paymentType : "one_time",
    recurring_interval: paid && primary.paymentType === "recurring" ? primary.recurringInterval : null,
    access_duration_days: paid ? accessDaysFor(primary) : null,
    has_free_trial: paid ? primary.hasFreeTrial : false,
    trial_days: paid ? trialDaysFor(primary) : null,
    pricing_options: paid ? options.map(serializeOption) : [],
    faq: (form.faq || [])
      .filter((it) => (it?.question || "").trim() || (it?.answer || "").trim())
      .map((it) => ({ question: (it?.question || "").trim(), answer: (it?.answer || "").trim() })),
    ...buildTaxonomyPayload(form, categories),
  };
}

/**
 * A brand-new product is always created private, so a draft that is saved
 * automatically as the seller types never reaches the marketplace on its own.
 */
export function buildCreatePayload(form: ProductDraftFormData, categories: CatalogCategory[]) {
  return {
    ...buildCommonPayload(form, categories),
    telegram_link: null,
    has_schedule: false,
    is_active: false,
  };
}

export type PersistableMedia = Pick<ProductMediaItem, "type" | "url" | "objectPosition">;

export function buildMediaPayload(media: PersistableMedia[]) {
  return {
    image_url: media.find((m) => m.type === "image")?.url || null,
    video_url: media.find((m) => m.type === "video")?.url || null,
    media: media.map((m) => ({ type: m.type, url: m.url, objectPosition: m.objectPosition })),
  };
}

/**
 * Stable text describing everything that would be saved. Two forms with the
 * same key would produce the same request, so an unchanged key means there is
 * nothing new to save. File contents are deliberately not part of it: a picked
 * file is identified by its id and url.
 */
export function saveKey(form: ProductDraftFormData, categories: CatalogCategory[]): string {
  return JSON.stringify({
    common: buildCommonPayload(form, categories),
    media: (form.media || []).map((m) => [m.id, m.type, m.url, m.objectPosition ?? null]),
  });
}
