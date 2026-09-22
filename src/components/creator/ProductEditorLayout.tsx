import { useState, type ReactNode } from "react";
import ProductPreviewPane from "@/components/creator/ProductPreviewPane";
import type { Product } from "@/hooks/useProducts";
import { useIsDesktop } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type ProductEditorLayoutProps = {
  previewProduct: Product | null;
  /** Cropping takes over the whole window, so both panes step aside. */
  previewHidden?: boolean;
  /** Left pane's top bar: the window title and the save indicator. */
  title?: ReactNode;
  /** Left pane's pinned bottom bar: the save button. */
  footer?: ReactNode;
  /** Right end of the preview's top bar: the window's close control. */
  headerRight?: ReactNode;
  children: ReactNode;
};

/**
 * The product editor window: sections on the left, live preview on the right.
 *
 * Two rules hold this together and are covered by tests:
 *
 * 1. The form (`children`) owns local state — the picked cover photo and the
 *    cropper. It must never be unmounted by a layout change, so every mode
 *    renders the same three slots in the same order; modes only change classes
 *    and which neighbouring slots are empty.
 * 2. The sections are centred with auto margins, not `justify-center`. Centring
 *    the scroll container itself pushes the first section above the scroll
 *    origin once the sections are expanded, where it cannot be reached.
 */
const ProductEditorLayout = ({
  previewProduct,
  previewHidden = false,
  title,
  footer,
  headerRight,
  children,
}: ProductEditorLayoutProps) => {
  const isDesktop = useIsDesktop();
  const { t } = useLanguage();
  const [tab, setTab] = useState<"editor" | "preview">("editor");

  const splitView = isDesktop && !previewHidden;
  const showTabs = !isDesktop && !previewHidden;
  const previewTabActive = showTabs && tab === "preview";
  const showPreview = !previewHidden && (isDesktop || previewTabActive);

  return (
    <div
      className={cn(
        "min-h-0 flex-1",
        splitView
          ? "grid lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]"
          : "flex flex-col",
      )}
    >
      {showTabs ? (
        // The extra right margin keeps the tabs clear of the window's close
        // cross, which sits at the top right corner.
        <div className="mb-3 ml-3 mr-12 mt-3 flex shrink-0 rounded-full border border-border bg-muted/40 p-1">
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
          // `flex-1` matters in the stacked layout, where the pane must fill the
          // window so its footer sits at the bottom; grid items ignore it.
          "flex min-h-0 min-w-0 flex-1 flex-col",
          previewTabActive && "hidden",
        )}
      >
        {title && !previewHidden ? (
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            {title}
          </div>
        ) : null}

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto",
            previewHidden ? "min-w-0" : "px-4 py-4",
          )}
        >
          <div className="my-auto w-full min-w-0">{children}</div>
        </div>

        {footer && !previewHidden ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>

      {showPreview ? (
        <ProductPreviewPane
          product={previewProduct}
          phoneOnly={!isDesktop}
          headerRight={headerRight}
          // `flex-1` for the same reason as the left pane: in the stacked
          // layout the pane must fill the window, or its stage measures zero
          // and the frame falls back to a size that overflows.
          className={cn("min-h-0 flex-1", isDesktop && "border-l border-border")}
        />
      ) : null}
    </div>
  );
};

export default ProductEditorLayout;
