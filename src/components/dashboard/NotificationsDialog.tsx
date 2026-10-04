import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Section bar pinned to the bottom on phones; tapping an item closes the dialog. */
  mobileNav?: ReactNode;
  /** Bar title; "Notifications" by default. */
  title?: ReactNode;
  /** Accessible name when the title is not plain text. */
  label?: string;
  /** The content fills the window and scrolls itself (a chat with its own input). */
  fill?: boolean;
}

/**
 * Notifications (and the support chat) open over whatever section is already on screen —
 * closing returns the reader to it, the same way account settings behave.
 */
const NotificationsDialog = ({ open, onOpenChange, children, mobileNav, title, label, fill = false }: Props) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4 md:p-6">
      <div
        className="login-modal-backdrop absolute inset-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : t("notifications"))}
        className="relative z-10 flex h-full w-full flex-col overflow-hidden border-border/80 bg-background shadow-2xl motion-safe:animate-fade-in sm:h-[85vh] sm:max-h-[720px] sm:max-w-2xl sm:rounded-2xl sm:border"
      >
        {/* Back arrow on the left, matching the settings window. */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 pt-[env(safe-area-inset-top)] sm:px-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {title && typeof title !== "string" ? (
            <div className="min-w-0 flex-1">{title}</div>
          ) : (
            <h2 className="truncate text-base font-semibold text-foreground">{title ?? t("notifications")}</h2>
          )}
        </div>
        <div
          className={cn(
            "min-h-0 flex-1",
            fill ? "flex flex-col" : "app-scroll overflow-y-auto px-4 py-4",
            mobileNav &&
              (fill ? "pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0" : "pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-4"),
          )}
        >
          {children}
        </div>
        {mobileNav && <div className="sm:hidden">{mobileNav}</div>}
      </div>
    </div>,
    document.body,
  );
};

export default NotificationsDialog;
