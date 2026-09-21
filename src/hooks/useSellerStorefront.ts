import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogProduct, SellerStorefront } from "@/lib/catalog";

export function useSellerStorefront(handle: string | undefined) {
  return useQuery({
    queryKey: ["seller-storefront", handle],
    queryFn: async (): Promise<SellerStorefront | null> => {
      if (!handle) return null;
      const { data, error } = await supabase.rpc("get_seller_storefront", {
        p_handle: handle,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object") return null;
      const raw = row as {
        handle?: string;
        display_name?: string | null;
        avatar_url?: string | null;
        type?: string;
        bio?: string | null;
        created_at?: string | null;
        avg_rating?: number | string | null;
        review_count?: number | null;
        sales_count?: number | null;
        products?: CatalogProduct[] | string;
      };
      if (!raw.handle) return null;
      const products = Array.isArray(raw.products)
        ? raw.products
        : [];
      return {
        handle: raw.handle,
        display_name: raw.display_name ?? null,
        avatar_url: raw.avatar_url ?? null,
        type: raw.type || "creator",
        bio: raw.bio ?? null,
        created_at: raw.created_at ?? null,
        avg_rating: Number(raw.avg_rating) || 0,
        review_count: Number(raw.review_count) || 0,
        sales_count: Number(raw.sales_count) || 0,
        products: products.map((item) => ({
          ...item,
          price: Number(item.price) || 0,
          has_schedule: Boolean(item.has_schedule),
        })),
      };
    },
    enabled: Boolean(handle),
  });
}
