import { useLanguage } from "@/contexts/LanguageContext";
import { subcategoryLabel, type CatalogCategory, type LessonFormat } from "@/lib/catalog";
import { cn } from "@/lib/utils";

type CatalogFilterRowProps = {
  categories: CatalogCategory[];
  categorySlug: string;
  subcategorySlug: string;
  lessonFormat?: LessonFormat | "";
  onSubcategoryChange: (slug: string) => void;
  onLessonFormatChange?: (format: LessonFormat | "") => void;
  className?: string;
};

const activeClass = "bg-[#FF6B00]/10 text-[#1F2328]";

/**
 * «Все подкатегории» on its own, then the subcategories joined into one segmented control,
 * like the week / month switch in the schedule.
 */
const CatalogFilterRow = ({
  categories,
  categorySlug,
  subcategorySlug,
  onSubcategoryChange,
  className,
}: CatalogFilterRowProps) => {
  const { t, language } = useLanguage();

  const category = categories.find((item) => item.slug === categorySlug);
  if (!category || category.subcategories.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <button
        type="button"
        aria-pressed={!subcategorySlug}
        onClick={() => onSubcategoryChange("")}
        className={cn(
          "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium focus-ring",
          !subcategorySlug
            ? cn("border-[#FF6B00]/30", activeClass)
            : "border-[#E3E5E8] bg-white text-[#1F2328] hover:border-[#D0D3D8]",
        )}
      >
        {t("allSubcategories")}
      </button>

      <div
        role="group"
        className="inline-flex h-9 max-w-full items-center overflow-x-auto rounded-full border border-[#E3E5E8] bg-white p-0.5 no-scrollbar"
      >
        {category.subcategories.map((subcategory) => {
          const active = subcategorySlug === subcategory.slug;
          return (
            <button
              key={subcategory.slug}
              type="button"
              aria-pressed={active}
              onClick={() => onSubcategoryChange(active ? "" : subcategory.slug)}
              className={cn(
                "inline-flex h-full shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors focus-ring",
                active ? activeClass : "text-[#1F2328] hover:bg-[#FF6B00]/5",
              )}
            >
              {subcategoryLabel(subcategory, language)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CatalogFilterRow;
