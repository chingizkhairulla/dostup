import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ratingDistribution, topReviews, useProductReviews } from "@/hooks/useProductReviews";
import AllReviewsDialog, { type RatingFilter } from "@/components/reviews/AllReviewsDialog";
import ReviewItem, { Stars } from "@/components/reviews/ReviewItem";

export default function ProductReviewsSection({ productId }: { productId: string }) {
  const { t } = useLanguage();
  const { data } = useProductReviews(productId);
  /** null = dialog closed; otherwise the filter the dialog opens with. */
  const [dialogFilter, setDialogFilter] = useState<RatingFilter | null>(null);

  const reviews = data?.reviews;
  const distribution = useMemo(() => ratingDistribution(reviews ?? []), [reviews]);
  const top = useMemo(() => topReviews(reviews ?? [], 2), [reviews]);

  if (!data) return null;

  const { avgRating, reviewCount } = data;

  return (
    <div className="mt-8">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t("reviewsTitle")}</h2>

      {reviewCount === 0 ? (
        <p className="public-meta">{t("reviewsEmpty")}</p>
      ) : (
        <>
          <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex flex-col items-center text-center sm:w-40 sm:shrink-0 sm:border-r sm:border-border sm:pr-6">
              <span className="text-4xl font-bold tabular-nums text-foreground">{avgRating.toFixed(1)}</span>
              <Stars rating={avgRating} className="mt-2" iconClassName="h-5 w-5" />
              <p className="mt-2 text-sm text-muted-foreground">
                {t("reviewsRatingsCount", { count: reviewCount })}
              </p>
            </div>

            <div className="flex-1 space-y-0">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star - 1];
                const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
                return (
                  <button
                    key={star}
                    type="button"
                    aria-label={`${star} ★: ${count}`}
                    onClick={() => setDialogFilter(star as RatingFilter)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted focus-ring"
                  >
                    <span className="w-3 text-sm tabular-nums text-muted-foreground">{star}</span>
                    <Star className="h-3.5 w-3.5 shrink-0 fill-[#FFB020] text-[#FFB020]" />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#FFB020]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-20 whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                      {`${Math.round(pct)}% (${count})`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">{t("reviewsTop")}</h3>
            <button
              type="button"
              onClick={() => setDialogFilter("all")}
              className="text-sm text-muted-foreground transition-colors hover:text-[#FF6B00]"
            >
              {t("reviewsSeeAll")}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {top.map((review) => (
              <div key={review.id} className="rounded-2xl border border-border bg-card p-4">
                <ReviewItem review={review} clamp />
              </div>
            ))}
          </div>

          <AllReviewsDialog
            open={dialogFilter !== null}
            onOpenChange={(open) => {
              if (!open) setDialogFilter(null);
            }}
            reviews={reviews ?? []}
            avgRating={avgRating}
            reviewCount={reviewCount}
            initialFilter={dialogFilter ?? "all"}
          />
        </>
      )}
    </div>
  );
}
