import { pluralForm, type Language, type Translated } from "./language";
import { CATEGORY_NAMES_EN, SUBCATEGORY_NAMES_EN } from "./taxonomyEn";

export type LessonFormat = "individual" | "group";
export type BillingPeriod = "month" | "quarter" | "year";

export type CatalogProduct = {
  id: string;
  slug: string | null;
  title: string;
  headline: string | null;
  image_url: string | null;
  video_url?: string | null;
  media?: Array<{ type: "image" | "video"; url: string }> | null;
  price: number;
  has_schedule: boolean;
  created_at: string;
  category_id: string;
  category_slug: string;
  category_name_ru: string;
  category_name_kk: string;
  category_emoji: string;
  subcategory_id: string;
  subcategory_slug: string;
  subcategory_name_ru: string;
  subcategory_name_kk: string;
  lesson_format: LessonFormat | null;
  event_starts_at: string | null;
  capacity: number | null;
  billing_period: BillingPeriod | null;
  payment_type?: string | null;
  recurring_interval?: string | null;
  has_free_trial?: boolean;
  trial_days?: number | null;
  pricing_options?: any[] | null;
  seller_handle: string | null;
  seller_display_name: string | null;
  seller_avatar_url: string | null;
  seller_type: string | null;
  avg_rating?: number;
  review_count?: number;
};

export type CatalogSubcategory = {
  id: string;
  slug: string;
  name_ru: string;
  name_kk: string;
  sort_order: number;
  product_count: number;
};

export type CatalogCategory = {
  id: string;
  slug: string;
  name_ru: string;
  name_kk: string;
  emoji: string;
  sort_order: number;
  product_count: number;
  subcategories: CatalogSubcategory[];
};

export type SellerStorefront = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  type: string;
  bio: string | null;
  created_at: string | null;
  avg_rating: number;
  review_count: number;
  sales_count: number;
  products: CatalogProduct[];
};

export const CATALOG_FILTER_THRESHOLD = 12;

function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// English has only one/other, so it needs its own branch rather than the
// Russian one/few/many rule.
export function sellerReviewsLabel(count: number, language: Language) {
  if (language === "en") return `${count} ${count === 1 ? "review" : "reviews"}`;
  if (language === "kk") return `${count} пікір`;
  return `${count} ${pluralRu(count, "отзыв", "отзыва", "отзывов")}`;
}

export function sellerSalesLabel(count: number, language: Language) {
  if (language === "en") return `${count} ${count === 1 ? "sale" : "sales"}`;
  if (language === "kk") return `${count} сатылым`;
  return `${count} ${pluralRu(count, "продажа", "продажи", "продаж")}`;
}

export function productHref(product: { id: string; slug?: string | null }) {
  return `/p/${encodeURIComponent(product.slug || product.id)}`;
}

export function formatPriceTenge(price: number) {
  const amount = new Intl.NumberFormat("ru-KZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);
  return `${amount}\u00A0₸`;
}

export function isLessonFormat(value: string | null | undefined): value is LessonFormat {
  return value === "individual" || value === "group";
}

export function isBillingPeriod(value: string | null | undefined): value is BillingPeriod {
  return value === "month" || value === "quarter" || value === "year";
}

const NEW_PRODUCT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isNewProduct(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_PRODUCT_WINDOW_MS;
}

// English names come from a slug-keyed map rather than the database; the
// fallback is deliberately Russian, never Kazakh, so an unmapped slug shows
// the language most of the audience reads.
function englishOr(map: Record<string, string>, slug: string | null | undefined, fallback: string) {
  return (slug && map[slug]) || fallback;
}

export function categoryLabel(
  category: Pick<CatalogCategory, "slug" | "name_ru" | "name_kk">,
  language: Language,
) {
  if (language === "en") return englishOr(CATEGORY_NAMES_EN, category.slug, category.name_ru);
  return language === "kk" ? category.name_kk : category.name_ru;
}

export function productCategoryLabel(
  product: Pick<CatalogProduct, "category_slug" | "category_name_ru" | "category_name_kk">,
  language: Language,
) {
  if (language === "en") {
    return englishOr(CATEGORY_NAMES_EN, product.category_slug, product.category_name_ru);
  }
  return language === "kk" ? product.category_name_kk : product.category_name_ru;
}

export function subcategoryLabel(
  subcategory: Pick<CatalogSubcategory, "slug" | "name_ru" | "name_kk">,
  language: Language,
) {
  if (language === "en") return englishOr(SUBCATEGORY_NAMES_EN, subcategory.slug, subcategory.name_ru);
  return language === "kk" ? subcategory.name_kk : subcategory.name_ru;
}

export function visibleTaxonomy(categories: CatalogCategory[]): CatalogCategory[] {
  return categories
    .filter((category) => category.product_count > 0)
    .map((category) => ({
      ...category,
      subcategories: category.subcategories.filter((subcategory) => subcategory.product_count > 0),
    }));
}

export function billingPeriodLabel(period: BillingPeriod, language: Language) {
  const labels: Record<BillingPeriod, Translated> = {
    month: { ru: "в месяц", kk: "айына", en: "per month" },
    quarter: { ru: "в квартал", kk: "тоқсанына", en: "per quarter" },
    year: { ru: "в год", kk: "жылына", en: "per year" },
  };
  return labels[period][language];
}

export function formatCatalogPrice(
  product: Pick<CatalogProduct, "price" | "category_slug" | "billing_period">,
  language: Language,
) {
  const price = formatPriceTenge(product.price);
  if (product.category_slug === "subscriptions" && product.billing_period) {
    return `${price} ${billingPeriodLabel(product.billing_period, language)}`;
  }
  return price;
}

/** "1 день / 3 дня / 7 дней", "7 күн", "1 day / 7 days". */
export function trialDays(days: number, language: Language) {
  const form = pluralForm(language, days);
  if (language === "ru") {
    const word = form === "one" ? "день" : form === "few" ? "дня" : "дней";
    return `${days} ${word}`;
  }
  if (language === "kk") return `${days} күн`;
  return `${days} ${form === "one" ? "day" : "days"}`;
}

type PricingOption = {
  price: number | string;
  payment_type?: string | null;
  recurring_interval?: string | null;
  access_duration_days?: number | null;
};

/** One pricing option as the product and checkout pages list it: "5 000 ₸ / в месяц". */
export function pricingOptionLabel(option: PricingOption, language: Language) {
  const price = formatPriceTenge(Number(option.price));
  if (option.payment_type === "one_time") {
    const once: Translated = { ru: "(разово)", kk: "(бір рет)", en: "(one-time)" };
    return `${price} ${once[language]}`;
  }
  const every = (days: number): Translated => ({
    ru: `каждые ${days} дн.`,
    kk: `әр ${days} күн сайын`,
    en: `every ${days} days`,
  });
  const periods: Record<string, Translated> = {
    "7d": every(7),
    "14d": every(14),
    "1m": { ru: "в месяц", kk: "айына", en: "per month" },
    "3m": { ru: "каждые 3 месяца", kk: "әр 3 ай сайын", en: "every 3 months" },
    "1y": { ru: "в год", kk: "жылына", en: "per year" },
    custom: every(option.access_duration_days || 30),
  };
  const period = periods[option.recurring_interval ?? ""] ?? periods["1m"];
  return `${price} / ${period[language]}`;
}

export function formatEventDate(iso: string, language: Language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const MONTHS: Record<Language, string[]> = {
    ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
    kk: ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"],
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  };
  const months = MONTHS[language];
  const day = date.getDate();
  const month = months[date.getMonth()] || "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const year = date.getFullYear();
  const yearPart = year !== new Date().getFullYear() ? ` ${year}` : "";
  return `${day} ${month}${yearPart}, ${hours}:${minutes}`;
}

const CATALOG_GAP = 24;
const CATALOG_MIN_CARD = 220;

/** Columns from the content width next to the rail, never below 220px cards. */
export function catalogColumnCount(width: number, gap = CATALOG_GAP, minCard = CATALOG_MIN_CARD) {
  if (width <= 0) return 1;
  let columns = 1;
  if (width >= 1100) columns = 4;
  else if (width >= 820) columns = 3;
  else if (width >= 560) columns = 2;
  while (columns > 1) {
    const card = (width - gap * (columns - 1)) / columns;
    if (card >= minCard) break;
    columns -= 1;
  }
  return columns;
}
