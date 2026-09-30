import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { buyerSectionFromPath, type BuyerSectionKey } from "@/lib/navigation";
import { useBuyerMobileNavItems } from "@/lib/mobileNavPreferences";
import { ActiveProfileAvatar } from "@/components/layout/HeaderControls";
import BuyerAccountSheet from "@/components/layout/BuyerAccountSheet";

export type BuyerMobileTab = BuyerSectionKey | "account";

interface BuyerMobileNavProps {
  activeTab?: BuyerMobileTab;
  onTabChange?: (tab: BuyerMobileTab) => void;
  /** Called after any section is picked — used by full-screen dialogs to close themselves. */
  onNavigate?: () => void;
}

const BuyerMobileNav = ({ activeTab, onTabChange, onNavigate }: BuyerMobileNavProps) => {
  const { t } = useLanguage();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const resolved = activeTab ?? buyerSectionFromPath(location.pathname) ?? "home";
  const { activeItems } = useBuyerMobileNavItems();

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg safe-area-inset md:hidden">
        <div
          className="grid h-16"
          style={{ gridTemplateColumns: `repeat(${activeItems.length + 1}, minmax(0, 1fr))` }}
        >
          {activeItems.map(({ key, labelKey, icon: Icon, to }) => {
            const active = resolved === key;
            return (
              <Link
                key={key}
                to={to}
                onClick={() => {
                  onTabChange?.(key);
                  onNavigate?.();
                }}
                aria-label={t(labelKey)}
                className="flex items-center justify-center h-full"
              >
                <span
                  className={cn(
                    "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={t("navProfiles") || "Профиль"}
            className="flex items-center justify-center h-full"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors text-muted-foreground hover:bg-muted hover:text-foreground">
              <ActiveProfileAvatar className="h-8 w-8" />
            </span>
          </button>
        </div>
      </nav>
      <BuyerAccountSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
};

export default BuyerMobileNav;
export { BuyerMobileNav };

