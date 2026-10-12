import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/lib/language";
import { cn } from "@/lib/utils";
import { Fragment } from "react";

// The header toggle a signed-out visitor sees. Driven by LANGUAGES so it can
// never fall out of step with the languages the platform actually speaks.
const PublicLocaleToggle = ({ className }: { className?: string }) => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t("languageSwitcherLabel")}
      className={cn("flex items-center gap-2 text-[13px] font-medium text-[#6B7280]", className)}
    >
      {LANGUAGES.map((entry, index) => (
        <Fragment key={entry.code}>
          {index > 0 && <span aria-hidden>/</span>}
          <button
            type="button"
            onClick={() => setLanguage(entry.code)}
            aria-pressed={language === entry.code}
            className={cn(
              "rounded-md px-1 py-1 focus-ring",
              language === entry.code ? "text-foreground" : "hover:text-foreground",
            )}
          >
            {entry.short}
          </button>
        </Fragment>
      ))}
    </div>
  );
};

export default PublicLocaleToggle;
