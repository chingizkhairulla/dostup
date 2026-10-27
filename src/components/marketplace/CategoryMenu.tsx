import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { categoryLabel, subcategoryLabel, type CatalogCategory } from "@/lib/catalog";
import { cn } from "@/lib/utils";

// Stretches over the whole right end of the search bar, so the full grey area is clickable,
// not only the words.
const TRIGGER_CLASS =
  "flex shrink-0 self-stretch items-center gap-1.5 whitespace-nowrap rounded-r-[10px] px-5 text-[15px] font-medium text-[#1F2328] focus-ring hover:bg-[#EDEEF0] motion-safe:transition-colors";

type CategoryMenuProps = {
  categories: CatalogCategory[];
  onSelect: (categorySlug: string, subcategorySlug: string) => void;
};

const CategoryMenu = ({ categories, onSelect }: CategoryMenuProps) => {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"categories" | "subcategories">("categories");
  const [mobileCategory, setMobileCategory] = useState<CatalogCategory | null>(null);

  useEffect(() => {
    if (!open) {
      setMobileView("categories");
      setMobileCategory(null);
      setHoveredSlug(null);
      return;
    }
    if (!isMobile && categories.length > 0 && !hoveredSlug) {
      setHoveredSlug(categories[0].slug);
    }
  }, [open, isMobile, categories, hoveredSlug]);

  if (categories.length === 0) return null;

  const activeCategory =
    categories.find((category) => category.slug === hoveredSlug) ?? categories[0];

  const handleSelect = (categorySlug: string, subcategorySlug: string) => {
    onSelect(categorySlug, subcategorySlug);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="true"
      className={TRIGGER_CLASS}
    >
      {t("allCategories")}
      <ChevronDown
        className={cn("h-4 w-4 text-[#6B7280] motion-safe:transition-transform", open && "rotate-180")}
        aria-hidden
      />
    </button>
  );

  if (isMobile) {
    return (
      <>
        <div className="h-8 w-px shrink-0 bg-[#E3E5E8]" aria-hidden />
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen(true)}
          className={TRIGGER_CLASS}
        >
          {t("allCategories")}
          <ChevronDown className="h-4 w-4 text-[#6B7280]" aria-hidden />
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[100dvh] rounded-none p-0 [&>button]:hidden">
            <SheetTitle className="sr-only">{t("allCategories")}</SheetTitle>
            <div className="flex h-full flex-col">
              {mobileView === "categories" ? (
                <>
                  <div className="border-b border-[#E3E5E8] px-6 py-5">
                    <h2 className="text-lg font-semibold text-[#1F2328]">{t("allCategories")}</h2>
                  </div>
                  <ul className="flex-1 overflow-y-auto">
                    {categories.map((category) => (
                      <li key={category.slug}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-6 py-4 text-left text-[16px] text-[#1F2328] hover:bg-[#F6F7F8] focus-ring"
                          onClick={() => {
                            if (category.subcategories.length > 0) {
                              setMobileCategory(category);
                              setMobileView("subcategories");
                            } else {
                              handleSelect(category.slug, "");
                            }
                          }}
                        >
                          <span>
                            {category.emoji} {categoryLabel(category, language)}
                          </span>
                          {category.subcategories.length > 0 && (
                            <ChevronDown className="-rotate-90 h-4 w-4 text-[#9AA0A6]" aria-hidden />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                mobileCategory && (
                  <>
                    <div className="flex items-center gap-2 border-b border-[#E3E5E8] px-4 py-4">
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[15px] font-medium text-[#1F2328] focus-ring hover:bg-[#F6F7F8]"
                        onClick={() => {
                          setMobileView("categories");
                          setMobileCategory(null);
                        }}
                      >
                        <ChevronLeft className="h-5 w-5" aria-hidden />
                        {t("allCategories")}
                      </button>
                    </div>
                    <div className="border-b border-[#E3E5E8] px-6 py-4">
                      <h2 className="text-lg font-semibold text-[#1F2328]">
                        {mobileCategory.emoji} {categoryLabel(mobileCategory, language)}
                      </h2>
                    </div>
                    <ul className="flex-1 overflow-y-auto">
                      {mobileCategory.subcategories.map((subcategory) => (
                        <li key={subcategory.slug}>
                          <button
                            type="button"
                            className="flex w-full px-6 py-4 text-left text-[16px] text-[#1F2328] hover:bg-[#F6F7F8] focus-ring"
                            onClick={() => handleSelect(mobileCategory.slug, subcategory.slug)}
                          >
                            {subcategoryLabel(subcategory, language)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )
              )}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <div className="h-8 w-px shrink-0 bg-[#E3E5E8]" aria-hidden />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(520px,calc(100vw-48px))] rounded-xl border-[#E3E5E8] p-0 shadow-lg"
        >
          <div className="flex">
            <ul className="w-1/2 border-r border-[#E3E5E8] py-2" role="listbox" aria-label={t("allCategories")}>
              {categories.map((category) => {
                const active = activeCategory.slug === category.slug;
                return (
                  <li key={category.slug}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] focus-ring",
                        active ? "bg-[#F6F7F8] font-medium text-[#1F2328]" : "text-[#1F2328] hover:bg-[#FAFBFC]",
                      )}
                      onMouseEnter={() => setHoveredSlug(category.slug)}
                      onFocus={() => setHoveredSlug(category.slug)}
                    >
                      <span>{category.emoji}</span>
                      <span>{categoryLabel(category, language)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* Every subcategory list sits in the same grid cell, so the window is as tall as the
                longest list and does not jump while the pointer moves between categories. */}
            <div className="grid w-1/2">
              {categories.map((category) => {
                const active = category.slug === activeCategory.slug;
                return (
                  <ul
                    key={category.slug}
                    role="listbox"
                    aria-hidden={!active}
                    className={cn("col-start-1 row-start-1 py-2", !active && "invisible")}
                  >
                    {category.subcategories.map((subcategory) => (
                      <li key={subcategory.slug}>
                        <button
                          type="button"
                          role="option"
                          tabIndex={active ? 0 : -1}
                          className="flex w-full px-4 py-2.5 text-left text-[15px] text-[#1F2328] hover:bg-[#FAFBFC] focus-ring"
                          onClick={() => handleSelect(category.slug, subcategory.slug)}
                        >
                          {subcategoryLabel(subcategory, language)}
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default CategoryMenu;
