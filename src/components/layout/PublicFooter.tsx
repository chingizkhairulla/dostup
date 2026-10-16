import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const FOOTER_LINK_CLASS =
  "text-[13px] text-[#6B7280] transition-colors hover:text-[#1F2328] focus-ring rounded-sm";

type PublicFooterProps = {
  className?: string;
};

const PublicFooter = ({ className }: PublicFooterProps) => {
  const { t } = useLanguage();

  return (
    <footer className={cn("mt-auto border-t border-[#E3E5E8] w-full", className)}>
      <div className="w-full px-4 sm:px-6 py-5">
        <div className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
          <p className="text-[13px] text-[#6B7280]">{t("footerCopyright")}</p>
          <div className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:gap-6">
            <Link to="/terms" className={FOOTER_LINK_CLASS}>
              {t("footerTerms")}
            </Link>
            <Link to="/privacy" className={FOOTER_LINK_CLASS}>
              {t("footerPrivacy")}
            </Link>
            <a href="mailto:chingizkhairulla@gmail.com" className={FOOTER_LINK_CLASS}>
              {t("footerContactEmail")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
