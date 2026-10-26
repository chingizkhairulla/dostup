import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProductReviews, useSaveProductReview } from "@/hooks/useProductReviews";
import { cn } from "@/lib/utils";

const STAR_VALUES = [1, 2, 3, 4, 5];

interface ReviewProductDialogProps {
  productId: string;
  productTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ReviewProductDialog = ({
  productId,
  productTitle,
  open,
  onOpenChange,
}: ReviewProductDialogProps) => {
  const { t } = useLanguage();
  const { data } = useProductReviews(productId);
  const save = useSaveProductReview(productId);
  const myReview = data?.myReview ?? null;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [closeHint, setCloseHint] = useState(false);

  // Each time the dialog opens, start again from the saved review.
  useEffect(() => {
    if (!open) {
      setCloseHint(false);
      return;
    }
    setRating(myReview?.rating ?? 0);
    setComment(myReview?.comment ?? "");
  }, [open, myReview]);

  const handleSave = () => {
    save.mutate(
      { rating, comment },
      {
        onSuccess: () => {
          toast.success(t("reviewsThanks"));
          onOpenChange(false);
        },
        onError: () => toast.error(t("reviewsError")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Nothing is saved until the button is pressed, so a click outside must not close it. */}
      <DialogContent
        hideCloseButton
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="line-clamp-2 text-base font-semibold">{productTitle}</DialogTitle>
          {/* Shown only while the pointer is over the cross: not on focus, not when the dialog opens. */}
          <Tooltip open={closeHint}>
            <TooltipTrigger asChild>
              <DialogClose
                onPointerEnter={(e) => e.pointerType === "mouse" && setCloseHint(true)}
                onPointerLeave={() => setCloseHint(false)}
                aria-label={t("unsavedChangesHint")}
                className="-mr-2 -mt-2 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
              >
                <X className="h-4 w-4" />
              </DialogClose>
            </TooltipTrigger>
            <TooltipContent>{t("unsavedChangesHint")}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex justify-center gap-1">
          {STAR_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} / 5`}
              onClick={() => setRating(value)}
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
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("reviewsCommentPlaceholder")}
          className="min-h-[100px]"
        />

        <Button
          className="w-full"
          disabled={rating === 0 || save.isPending}
          onClick={handleSave}
        >
          {myReview ? t("reviewsUpdate") : t("reviewsAdd")}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewProductDialog;
