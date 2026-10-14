import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import RateProductDialog from "@/components/reviews/RateProductDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProductReviews, useSaveProductReview } from "@/hooks/useProductReviews";
import { cn } from "@/lib/utils";

const STAR_VALUES = [1, 2, 3, 4, 5];

interface PurchaseRatingProps {
  productId: string;
  productTitle: string;
}

const PurchaseRating = ({ productId, productTitle }: PurchaseRatingProps) => {
  const { t } = useLanguage();
  const { data } = useProductReviews(productId);
  const save = useSaveProductReview(productId);
  const [open, setOpen] = useState(false);
  const [initialRating, setInitialRating] = useState(0);

  if (!data?.canReview) return null;

  const myRating = data.myReview?.rating ?? 0;

  const handleStar = (value: number) => {
    setInitialRating(value);
    setOpen(true);
    save.mutate(
      { rating: value, comment: data.myReview?.comment ?? "" },
      { onError: () => toast.error(t("reviewsError")) },
    );
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      {!data.myReview && (
        <span className="text-sm text-muted-foreground">{t("reviewsRateProduct")}</span>
      )}
      {STAR_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`${value} / 5`}
          onClick={() => handleStar(value)}
          className="rounded-sm transition-transform hover:scale-110 focus-ring"
        >
          <Star
            className={cn(
              "h-5 w-5",
              value <= myRating ? "fill-[#FFB020] text-[#FFB020]" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
      <RateProductDialog
        productId={productId}
        productTitle={productTitle}
        open={open}
        onOpenChange={setOpen}
        initialRating={initialRating}
      />
    </div>
  );
};

export default PurchaseRating;
