import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeApi } from "@/lib/sessionApi";

export interface ProductReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  buyer_display_name: string | null;
  buyer_avatar_url: string | null;
}

export interface ProductReviewsData {
  reviews: ProductReview[];
  avgRating: number;
  reviewCount: number;
  myReview: { rating: number; comment: string | null } | null;
  canReview: boolean;
}

function sessionToken() {
  return localStorage.getItem("creator_token") || "";
}

export function productReviewsKey(productId: string | undefined) {
  return ["product-reviews", productId] as const;
}

export function useProductReviews(productId: string | undefined) {
  const token = sessionToken();
  return useQuery({
    queryKey: [...productReviewsKey(productId), token],
    queryFn: () =>
      invokeApi<ProductReviewsData>("manage-reviews", {
        action: "list",
        productId: productId ?? "",
        sessionToken: token,
      }),
    enabled: Boolean(productId),
  });
}

export function useSaveProductReview(productId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: number; comment: string }) =>
      invokeApi<ProductReviewsData>("manage-reviews", {
        action: "upsert",
        productId: productId ?? "",
        rating: input.rating,
        comment: input.comment,
        sessionToken: sessionToken(),
      }),
    onSuccess: (data) => {
      queryClient.setQueriesData({ queryKey: productReviewsKey(productId) }, data);
    },
  });
}

/** Count of reviews per star, index 0 = 1 star … index 4 = 5 stars. */
export function ratingDistribution(reviews: ProductReview[]) {
  const counts = [0, 0, 0, 0, 0];
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1] += 1;
  }
  return counts;
}

/** Highest-rated first; within one rating, reviews with text first, then newest. */
export function topReviews(reviews: ProductReview[], limit = 2) {
  return [...reviews]
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      const aText = a.comment?.trim() ? 1 : 0;
      const bText = b.comment?.trim() ? 1 : 0;
      if (bText !== aText) return bText - aText;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, limit);
}
