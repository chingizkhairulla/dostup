import { useState } from "react";
import { ActiveProfileAvatar } from "@/components/layout/HeaderControls";
import BuyerAccountSheet from "@/components/layout/BuyerAccountSheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCreatorMobileNavItems } from "@/lib/mobileNavPreferences";
import { cn } from "@/lib/utils";

interface Props {
  activeTab?: string;
  onTabChange: (tab: string) => void;
  /** Called after any section is picked — full-screen dialogs use it to close themselves. */
  onNavigate?: () => void;
}

/**
 * The author's bottom section bar. It lives in its own component so a full-screen dialog can
 * render it too, letting the reader jump straight to a section from inside the overlay.
 */
const CreatorMobileNav = ({ activeTab, onTabChange, onNavigate }: Props) => {
  const { t } = useLanguage();
  const { activeItems } = useCreatorMobileNavItems();
  const [sheetOpen, setSheetOpen] = useState(false);

  const pick = (key: string) => {
    onTabChange(key);
    onNavigate?.();
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-lg border-t border-border safe-area-inset">
        <div className="max-w-2xl mx-auto">
          <div
            className="w-full h-16 bg-transparent rounded-none grid gap-0"
            style={{ gridTemplateColumns: `repeat(${activeItems.length + 1}, minmax(0, 1fr))` }}
          >
            {activeItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => pick(item.key)}
                  aria-label={t(item.labelKey)}
                  className="flex items-center justify-center h-full"
                >
                  <span
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                      activeTab === item.key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label={t("navProfiles") || "Профиль"}
              className="flex items-center justify-center h-full"
            >
              <span
                className={cn(
                  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                  activeTab === "users"
                    ? "bg-primary/15 text-primary ring-2 ring-primary/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <ActiveProfileAvatar className="h-8 w-8" />
              </span>
            </button>
          </div>
        </div>
      </nav>

      <BuyerAccountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSelectSection={(secKey) => pick(secKey)}
      />
    </>
  );
};

export default CreatorMobileNav;
