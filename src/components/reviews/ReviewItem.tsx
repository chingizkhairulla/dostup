import { formatDistanceToNow, isValid, parseISO } from "date-fns";
import { kk, ru } from "date-fns/locale";
import { Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ProductReview } from "@/hooks/useProductReviews";
import { sellerInitial } from "@/lib/productCover";
import { cn } from "@/lib/utils";

/** Five stars; fractional ratings are rounded. `className` goes on the row, `iconClassName` on each star. */
export function Stars({
  rating,
  className,
  iconClassName,
}: {
  rating: number;
  className?: string;
  iconClassName?: string;
}) {
  const filled = Math.round(rating);
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-4 w-4",
            star <= filled ? "fill-[#FFB020] text-[#FFB020]" : "text-muted-foreground/30",
            iconClassName,
          )}
        />
      ))}
    </div>
  );
}

export default function ReviewItem({ review, clamp = false }: { review: ProductReview; clamp?: boolean }) {
  const { t, language } = useLanguage();
  const name = review.buyer_display_name?.trim() || t("author");

  const createdAt = parseISO(review.created_at);
  const relative = isValid(createdAt)
    ? formatDistanceToNow(createdAt, { addSuffix: true, locale: language === "kk" ? kk : ru })
    : "";

  const comment = review.comment?.trim();

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            {review.buyer_avatar_url && <AvatarImage src={review.buyer_avatar_url} alt="" />}
            <AvatarFallback className="text-xs">{sellerInitial(name)}</AvatarFallback>
          </Avatar>
          <span className="truncate font-semibold text-foreground">{name}</span>
        </div>
        {relative && <span className="shrink-0 text-sm text-muted-foreground">{relative}</span>}
      </div>

      <Stars rating={review.rating} className="mt-2" />

      {comment && (
        <p
          className={cn(
            "mt-2 whitespace-pre-wrap break-words text-foreground/90",
            clamp && "line-clamp-4",
          )}
        >
          {comment}
        </p>
      )}
    </div>
  );
}
