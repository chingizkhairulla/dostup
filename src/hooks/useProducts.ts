import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";

export interface Product {
  id: string;
  creator_id: string;
  creator_account_id?: string | null;
  title: string;
  headline: string | null;
  description: string | null;
  price: number;
  image_url: string | null;
  video_url: string | null;
  media?: Array<{ type: "image" | "video"; url: string }> | null;
  has_schedule: boolean;
  is_active: boolean;
  /** Seller-only: shown in the marketplace catalog. */
  is_published?: boolean;
  slug: string | null;
  created_at: string;
  updated_at: string;
  kaspi_link: string | null;
  telegram_link: string | null;
  faq: Array<{ question: string; answer: string }> | null;
  kaspi_phone: string | null;
  access_duration_days: number | null;
  is_paused?: boolean;
  paused_message?: string | null;
  author_name?: string | null;
  seller_handle?: string | null;
  seller_avatar_url?: string | null;
  seller_type?: string | null;
  category_id?: string;
  subcategory_id?: string;
  lesson_format?: string | null;
  event_starts_at?: string | null;
  capacity?: number | null;
  billing_period?: string | null;
  category_slug?: string | null;
  payment_type?: string | null;
  recurring_interval?: string | null;
  has_free_trial?: boolean;
  trial_days?: number | null;
  pricing_options?: ProductPricingOption[] | null;
}

export interface ProductPricingOption {
  id: string;
  name?: string;
  payment_type: "one_time" | "recurring";
  price: number;
  recurring_interval?: string | null;
  recurring_custom_days?: number | null;
  has_free_trial: boolean;
  trial_preset?: "3" | "7" | "30" | "custom";
  trial_days?: number | null;
  access_duration_days?: number | null;
  kaspi_link?: string | null;
  kaspi_phone?: string | null;
  /** Card number, digits grouped in fours. Lives only in pricing_options, no column. */
  kaspi_card?: string | null;
}

export interface ProductProgramItem {
  id: string;
  title: string;
  type: string;
  parent_id: string | null;
  order_index: number;
}

export const useCatalogProducts = () => {
  return useQuery({
    queryKey: ["catalog-products"],
    queryFn: async () => {
      const data = await invokeApi<{ products: Product[] }>("catalog", {
        action: "list_products",
      });
      return data.products ?? [];
    },
  });
};

export const useProduct = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      if (!productId) return null;
      const data = await invokeApi<{ product: Product | null }>("catalog", {
        action: "get_product",
        idOrSlug: productId,
      });
      return data.product;
    },
    enabled: !!productId,
  });
};

export const useProductProgram = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["product-program", productId],
    queryFn: async () => {
      if (!productId) return [];
      const data = await invokeApi<{ items: ProductProgramItem[] }>("catalog", {
        action: "list_program",
        productId,
      });
      return data.items ?? [];
    },
    enabled: !!productId,
  });
};

export const useCheckoutProduct = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["checkout-product", productId],
    queryFn: async () => {
      if (!productId) return null;
      const data = await invokeApi<{ product: Product | null }>("checkout", {
        action: "get_product",
        idOrSlug: productId,
      });
      return data.product;
    },
    enabled: !!productId,
  });
};

export const useCreatorId = (passedCreatorName?: string | null) => {
  const { user } = useSimpleAuth();
  const localStorageName = typeof window !== "undefined" ? localStorage.getItem("creator_name") : null;
  const creatorName = passedCreatorName ?? localStorageName;

  if (user && user.role === "creator") {
    return user.id;
  }
  if (creatorName) return creatorName;
  return null;
};

export const useCreatorProducts = (passedCreatorName?: string | null) => {
  const creatorId = useCreatorId(passedCreatorName);

  return useQuery({
    queryKey: ["creator-products", creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const data = await invokeApi<{ products: Product[] }>("manage-products", {
        action: "list",
        ...creatorCreds(),
      });
      return data.products ?? [];
    },
    enabled: !!creatorId,
    staleTime: 0,
    refetchOnMount: "always",
  });
};

interface CreateProductInput {
  title: string;
  headline?: string | null;
  description?: string | null;
  price: number;
  kaspi_link?: string | null;
  telegram_link?: string | null;
  has_schedule?: boolean;
  is_active?: boolean;
  image_url?: string | null;
  video_url?: string | null;
  slug?: string | null;
  faq?: Array<{ question: string; answer: string }> | null;
  kaspi_phone?: string | null;
  access_duration_days?: number | null;
  category_id: string;
  subcategory_id: string;
  lesson_format?: string | null;
  event_starts_at?: string | null;
  capacity?: number | null;
  billing_period?: string | null;
  payment_type?: string | null;
  recurring_interval?: string | null;
  has_free_trial?: boolean;
  trial_days?: number | null;
  pricing_options?: ProductPricingOption[] | null;
  topic?: string | null;
}

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  const creatorId = useCreatorId();

  return useMutation({
    mutationFn: async (product: CreateProductInput) => {
      if (!creatorId) throw new Error("Not authenticated");
      const data = await invokeApi<{ product: Product }>("manage-products", {
        action: "create",
        ...creatorCreds(),
        product,
      });
      return data.product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-products"] });
      queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
    },
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const data = await invokeApi<{ product: Product }>("manage-products", {
        action: "update",
        ...creatorCreds(),
        id,
        updates,
      });
      return data.product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-products"] });
      queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
    },
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      await invokeApi("manage-products", {
        action: "delete",
        ...creatorCreds(),
        id: productId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-products"] });
      queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
    },
  });
};
