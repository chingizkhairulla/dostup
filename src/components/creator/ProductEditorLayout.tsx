import { useState, type ReactNode } from "react";
import ProductPreviewPane from "@/components/creator/ProductPreviewPane";
import type { Product } from "@/hooks/useProducts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type ProductEditorLayoutProps = {
  previewProduct: Product | null;
  /** Cropping takes over the full dialog, so the preview is hidden while it runs. */
  previewHidden?: boolean;
  children: ReactNode;
};

/**
 * Two-pane product editor: form on the left, live preview on the right. On small
 * screens the panes become tabs so the form is never horizontally squeezed.
 *
 * The form (`children`) holds local state — the picked cover photo, the cropper —
 * so it must never be unmounted by a layout change. Every mode therefore renders
 * the same three slots in the same order (tabs, form, preview); modes only change
 * classes and which of the neighbouring slots are empty. Returning a differently
 * shaped tree per mode would make React remount the form and silently drop the
 * photo the moment it was picked.
 */
const ProductEditorLayout = ({
  previewProduct,
  previewHidden = false,
  children,
}: ProductEditorLayoutProps) => {
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const [tab, setTab] = useState<"editor" | "preview">("editor");

  const splitView = !isMobile && !previewHidden;
  const showTabs = isMobile && !previewHidden;
  const previewTabActive = showTabs && tab === "preview";
  const showPreview = !previewHidden && (!isMobile || previewTabActive);

  return (
    <div
      className={cn(
        "min-h-0 flex-1",
        splitView
          ? "grid gap-6 lg:grid-cols-[minmax(420px,1fr)_minmax(0,1.1fr)]"
          : "flex flex-col gap-3",
      )}
    >
      {showTabs ? (
        <div className="flex shrink-0 rounded-full border border-border bg-muted/40 p-1">
          {(["editor", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
                tab === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "editor" ? t("editorTab") : t("previewTab")}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "min-h-0 min-w-0 overflow-y-auto",
          splitView ? "pr-1" : "flex-1",
          previewTabActive && "hidden",
        )}
      >
        {children}
      </div>
      {showPreview ? (
        <ProductPreviewPane
          product={previewProduct}
          phoneOnly={isMobile}
          className={isMobile ? "min-h-0 flex-1" : "hidden min-h-0 lg:flex"}
        />
      ) : null}
    </div>
  );
};

export default ProductEditorLayout;
