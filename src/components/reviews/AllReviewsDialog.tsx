import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ProductReview } from "@/hooks/useProductReviews";
import { cn } from "@/lib/utils";
import ReviewItem from "@/components/reviews/ReviewItem";

interface AllReviewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviews: ProductReview[];
  avgRating: number;
  reviewCount: number;
}

type RatingFilter = "all" | 1 | 2 | 3 | 4 | 5;

const RATING_FILTERS: Array<5 | 4 | 3 | 2 | 1> = [5, 4, 3, 2, 1];

export default function AllReviewsDialog({
  open,
  onOpenChange,
  reviews,
  avgRating,
  reviewCount,
}: AllReviewsDialogProps) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<RatingFilter>("all");

  useEffect(() => {
    if (open) setFilter("all");
  }, [open]);

  const visible = useMemo(() => {
    const list = filter === "all" ? reviews : reviews.filter((r) => r.rating === filter);
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [reviews, filter]);

  const chipClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-[#FF6B00] text-white" : "bg-muted text-foreground hover:bg-[#FF6B00]/15",
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <div className="border-b border-border p-6">
          <DialogTitle className="text-center">{t("reviewsTitle")}</DialogTitle>

          <div className="mt-5 flex flex-col items-center text-center">
            <p className="text-sm text-muted-foreground">{t("reviewsOverall")}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-4xl font-bold tabular-nums text-foreground">{avgRating.toFixed(2)}</span>
              <Star className="h-8 w-8 fill-[#FFB020] text-[#FFB020]" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("reviewsRatingsCount", { count: reviewCount })}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={chipClass(filter === "all")}
            >
              {t("reviewsAll")}
            </button>
            {RATING_FILTERS.map((star) => (
              <button
                key={star}
                type="button"
                aria-pressed={filter === star}
                onClick={() => setFilter(star)}
                className={chipClass(filter === star)}
              >
                <Star className="h-3.5 w-3.5 fill-[#FFB020] text-[#FFB020]" />
                {star}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("reviewsNoMatch")}</p>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((review) => (
                <div key={review.id} className="py-4">
                  <ReviewItem review={review} />
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
