import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import type { BookmarkState, BookmarkUserType } from "@/hooks/useMaterialBookmarks";

interface Props {
  viewerType: BookmarkUserType;
  state: BookmarkState | undefined;
  onToggleMine: () => void;
  /** Deprecated — public visibility is now controlled by a single bulk switch in the bookmarks section. */
  onTogglePublic?: () => void;
  size?: "sm" | "md";
  /** Deprecated — see onTogglePublic. */
  allowMakePublic?: boolean;
  disabled?: boolean;
}

export const BookmarkStars = ({
  viewerType,
  state,
  onToggleMine,
  size = "sm",
  disabled,
}: Props) => {
  const { language } = useLanguage();
  const mine = state?.mine ?? null;
  const authorPublic = state?.authorPublic ?? null;
  const isCreator = viewerType === "creator";
  // Don't show "author" star to creator viewer (it's their own mark anyway).
  const showAuthorStar = !isCreator && !!authorPublic;

  const iconSize = size === "md" ? "w-5 h-5" : "w-4 h-4";
  const btnSize = size === "md" ? "h-10 w-10" : "h-8 w-8";

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      {showAuthorStar && (
        <span
          className="inline-flex items-center justify-center"
          title={language === "kk" ? "Автор белгілеген" : "Отмечено автором"}
        >
          <Star className={`${iconSize} text-primary fill-primary/60`} />
        </span>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`${btnSize} group min-h-0`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMine();
        }}
        title={
          mine
            ? language === "kk" ? "Белгіні алу" : "Снять пометку"
            : language === "kk" ? "Белгілеу" : "Пометить"
        }
      >
        <Star
          className={`${iconSize} transition-colors ${mine ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground group-hover:text-white group-active:text-white"}`}
        />
      </Button>
    </div>
  );
};

export default BookmarkStars;
