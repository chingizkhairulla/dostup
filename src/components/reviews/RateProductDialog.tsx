import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProductReviews, useSaveProductReview } from "@/hooks/useProductReviews";
import { cn } from "@/lib/utils";

const COMMENT_DEBOUNCE_MS = 800;
const STAR_VALUES = [1, 2, 3, 4, 5];

interface RateProductDialogProps {
  productId: string;
  productTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRating: number;
}

const RateProductDialog = ({
  productId,
  productTitle,
  open,
  onOpenChange,
  initialRating,
}: RateProductDialogProps) => {
  const { t } = useLanguage();
  const { data } = useProductReviews(productId);
  const save = useSaveProductReview(productId);
  const serverComment = data?.myReview?.comment ?? "";

  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(serverComment);

  // Refs hold the latest values so timers and the close handler never see stale state.
  const ratingRef = useRef(rating);
  const commentRef = useRef(comment);
  const savedCommentRef = useRef(comment);
  const serverCommentRef = useRef(serverComment);
  const initialRatingRef = useRef(initialRating);
  const touchedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    serverCommentRef.current = serverComment;
    initialRatingRef.current = initialRating;
  });

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const nextComment = serverCommentRef.current;
    touchedRef.current = false;
    ratingRef.current = initialRatingRef.current;
    commentRef.current = nextComment;
    savedCommentRef.current = nextComment;
    setRating(initialRatingRef.current);
    setComment(nextComment);
  }, [open]);

  // Comment may arrive after opening; pick it up until the user starts typing.
  useEffect(() => {
    if (!open || touchedRef.current) return;
    commentRef.current = serverComment;
    savedCommentRef.current = serverComment;
    setComment(serverComment);
  }, [open, serverComment]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const persist = (nextRating: number, nextComment: string) => {
    savedCommentRef.current = nextComment;
    save.mutate(
      { rating: nextRating, comment: nextComment },
      { onError: () => toast.error(t("reviewsError")) },
    );
  };

  const flush = () => {
    clearTimer();
    if (ratingRef.current > 0 && commentRef.current !== savedCommentRef.current) {
      persist(ratingRef.current, commentRef.current);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) flush();
    onOpenChange(next);
  };

  const handleRate = (value: number) => {
    ratingRef.current = value;
    setRating(value);
    clearTimer();
    persist(value, commentRef.current);
  };

  const handleCommentChange = (value: string) => {
    touchedRef.current = true;
    commentRef.current = value;
    setComment(value);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (ratingRef.current > 0 && commentRef.current !== savedCommentRef.current) {
        persist(ratingRef.current, commentRef.current);
      }
    }, COMMENT_DEBOUNCE_MS);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideCloseButton className="max-w-md">
        <DialogTitle className="line-clamp-2 text-base font-semibold">{productTitle}</DialogTitle>

        <div className="flex justify-center gap-1">
          {STAR_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} / 5`}
              onClick={() => handleRate(value)}
              className="rounded-md p-0.5 transition-transform hover:scale-110 focus-ring"
            >
              <Star
                className={cn(
                  "h-8 w-8",
                  value <= rating ? "fill-[#FFB020] text-[#FFB020]" : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>

        <Textarea
          value={comment}
          onChange={(e) => handleCommentChange(e.target.value)}
          placeholder={t("reviewsCommentPlaceholder")}
          className="min-h-[100px]"
        />
      </DialogContent>
    </Dialog>
  );
};

export default RateProductDialog;
