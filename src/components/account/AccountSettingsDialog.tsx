import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimplePurchases } from "@/hooks/useSimplePurchases";
import AccountSettingsView, { SettingsSectionKey } from "@/components/account/AccountSettingsView";
import { cn } from "@/lib/utils";

export function openAccountSettings(section?: SettingsSectionKey) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("open-account-settings", { detail: { section } })
    );
  }
}

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "buyer" | "creator" | "school" | "teacher";
  displayName: string;
  createdAt?: Date | string | null;
  userId?: string;
  initialSection?: SettingsSectionKey;
  /** Section bar pinned to the bottom on phones; tapping an item closes the dialog. */
  mobileNav?: ReactNode;
}

export const AccountSettingsDialog = ({
  open,
  onOpenChange,
  role,
  displayName,
  createdAt,
  userId,
  initialSection,
  mobileNav,
}: AccountSettingsDialogProps) => {
  const { t } = useLanguage();
  const { data: purchases, isLoading: purchasesLoading } = useSimplePurchases();

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
      {/* Blurred Backdrop — same frosted glass as registration and mode selection */}
      <div
        className="login-modal-backdrop absolute inset-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("accountSettings")}
        className="relative z-10 flex h-full w-full flex-col overflow-hidden border-border/80 bg-background shadow-2xl motion-safe:animate-fade-in sm:h-[85vh] sm:max-h-[720px] sm:max-w-4xl sm:rounded-2xl sm:border"
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            mobileNav && "pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0",
          )}
        >
          <AccountSettingsView
            role={role}
            displayName={displayName}
            createdAt={createdAt}
            userId={userId}
            purchases={purchases}
            purchasesLoading={purchasesLoading}
            onClose={() => onOpenChange(false)}
            initialSection={initialSection}
          />
        </div>
        {mobileNav && <div className="sm:hidden">{mobileNav}</div>}
      </div>
    </div>,
    document.body,
  );
};

export default AccountSettingsDialog;
