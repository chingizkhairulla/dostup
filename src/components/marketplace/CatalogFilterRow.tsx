import { useLanguage } from "@/contexts/LanguageContext";
import { subcategoryLabel, type CatalogCategory, type LessonFormat } from "@/lib/catalog";
import { cn } from "@/lib/utils";

type CatalogFilterRowProps = {
  categories: CatalogCategory[];
  categorySlug: string;
  subcategorySlug: string;
  lessonFormat: LessonFormat | "";
  onSubcategoryChange: (slug: string) => void;
  onLessonFormatChange: (format: LessonFormat | "") => void;
};

const CatalogFilterRow = ({
  categories,
  categorySlug,
  subcategorySlug,
  lessonFormat,
  onSubcategoryChange,
  onLessonFormatChange,
}: CatalogFilterRowProps) => {
  const { t, language } = useLanguage();

  const category = categories.find((item) => item.slug === categorySlug);
  if (!category) return null;

  const subcategories = category.subcategories;
  const showLessonFormat = categorySlug === "online-lessons";

  if (subcategories.length === 0 && !showLessonFormat) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {subcategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={!subcategorySlug}
            onClick={() => onSubcategoryChange("")}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium focus-ring",
              !subcategorySlug
                ? "border-primary/30 bg-primary/10 text-[#1F2328]"
                : "border-[#E3E5E8] bg-white text-[#1F2328] hover:border-[#D0D3D8]",
            )}
          >
            {t("allSubcategories")}
          </button>
          {subcategories.map((subcategory) => {
            const active = subcategorySlug === subcategory.slug;
            return (
              <button
                key={subcategory.slug}
                type="button"
                aria-pressed={active}
                onClick={() => onSubcategoryChange(active ? "" : subcategory.slug)}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium focus-ring",
                  active
                    ? "border-primary/30 bg-primary/10 text-[#1F2328]"
                    : "border-[#E3E5E8] bg-white text-[#1F2328] hover:border-[#D0D3D8]",
                )}
              >
                {subcategoryLabel(subcategory, language)}
              </button>
            );
          })}
        </div>
      )}

      {showLessonFormat && (
        <div
          className={cn(
            "flex items-center gap-1 rounded-full border border-[#E3E5E8] bg-white p-1",
            subcategories.length > 0 && "sm:ml-2",
          )}
          role="group"
          aria-label={t("filterFormat")}
        >
          {(
            [
              { value: "individual" as const, labelKey: "filterLessonIndividual" as const },
              { value: "group" as const, labelKey: "filterLessonGroup" as const },
            ] as const
          ).map((option) => {
            const active = lessonFormat === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onLessonFormatChange(active ? "" : option.value)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full px-3 text-sm font-medium focus-ring",
                  active ? "bg-primary/10 text-[#1F2328]" : "text-[#6B7280] hover:text-[#1F2328]",
                )}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CatalogFilterRow;
