import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CATALOG_FILTER_THRESHOLD,
  isBillingPeriod,
  isLessonFormat,
  type BillingPeriod,
  type CatalogCategory,
  type CatalogProduct,
  type LessonFormat,
} from "@/lib/catalog";

export type CatalogSort = "newest" | "price_asc" | "price_desc" | "rating" | "popular" | "trending";

export type CatalogFilters = {
  q?: string;
  categorySlug?: string;
  subcategorySlug?: string;
  lessonFormat?: LessonFormat | "";
  billingPeriod?: BillingPeriod | "";
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: CatalogSort;
  onlyNew?: boolean;
};

function asCatalogRows(data: unknown): CatalogProduct[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const item = row as CatalogProduct;
    return {
      ...item,
      price: Number(item.price) || 0,
      has_schedule: Boolean(item.has_schedule),
      category_emoji: item.category_emoji || "",
      lesson_format: isLessonFormat(item.lesson_format) ? item.lesson_format : null,
      billing_period: isBillingPeriod(item.billing_period) ? item.billing_period : null,
      capacity: item.capacity == null ? null : Number(item.capacity),
      avg_rating: item.avg_rating != null ? Number(item.avg_rating) : 0,
      review_count: item.review_count != null ? Number(item.review_count) : 0,
    };
  });
}

async function searchCatalog(filters: CatalogFilters, limit = 48, offset = 0) {
  const { data, error } = await supabase.rpc("search_catalog", {
    q: filters.q?.trim() || null,
    p_category_slug: filters.categorySlug?.trim() || null,
    p_subcategory_slug: filters.subcategorySlug?.trim() || null,
    p_lesson_format: filters.lessonFormat || null,
    p_billing_period: filters.billingPeriod || null,
    p_min: filters.minPrice ?? null,
    p_max: filters.maxPrice ?? null,
    p_sort: filters.sort || "newest",
    p_limit: limit,
    p_offset: offset,
    p_only_new: filters.onlyNew ?? false,
  });
  if (error) throw error;
  return asCatalogRows(data);
}

export function useCatalogPreview(enabled = true, limit = CATALOG_FILTER_THRESHOLD) {
  return useQuery({
    queryKey: ["catalog-preview", limit],
    queryFn: () => searchCatalog({}, limit, 0),
    enabled,
  });
}

export function useCatalogSearch(filters: CatalogFilters, enabled = true, limit = 48) {
  return useQuery({
    queryKey: ["catalog-search", filters, limit],
    queryFn: () => searchCatalog(filters, limit, 0),
    enabled,
  });
}

const HOME_RAIL_LIMIT = 8;

/**
 * A sales-driven rail only earns its place once it has a few products to show — one or two
 * cards read as a bug, not as a ranking. Below this the homepage hides the rail entirely,
 * so "Популярные" and "В тренде" switch themselves on as the marketplace fills up.
 */
export const HOME_RAIL_MIN_ITEMS = 3;

export function useNewProducts(enabled = true) {
  return useCatalogSearch({ sort: "newest", onlyNew: true }, enabled, HOME_RAIL_LIMIT);
}

export function useTopRatedProducts(enabled = true) {
  return useCatalogSearch({ sort: "rating" }, enabled, HOME_RAIL_LIMIT);
}

/** Most completed purchases over the last 30 days. */
export function usePopularProducts(enabled = true) {
  return useCatalogSearch({ sort: "popular" }, enabled, HOME_RAIL_LIMIT);
}

/** Selling faster this week than last — growth, not volume. */
export function useTrendingProducts(enabled = true) {
  return useCatalogSearch({ sort: "trending" }, enabled, HOME_RAIL_LIMIT);
}

export function useCatalogTaxonomy(enabled = true) {
  return useQuery({
    queryKey: ["catalog-taxonomy"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_catalog_taxonomy");
      if (error) throw error;
      return (data ?? []) as CatalogCategory[];
    },
    enabled,
  });
}

export function useCatalogProductsByIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  return useQuery({
    queryKey: ["catalog-by-ids", unique],
    queryFn: async () => {
      if (!unique.length) return [] as CatalogProduct[];
      const { data, error } = await supabase.from("public_products").select("*").in("id", unique);
      if (error) throw error;
      return asCatalogRows(data);
    },
    enabled: unique.length > 0,
  });
}
