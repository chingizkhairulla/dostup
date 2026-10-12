import IosInstallSheet from "@/components/install/IosInstallSheet";
import { useInstallPrompt } from "@/contexts/InstallPromptContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const InstallBanner = () => {
  const { t } = useLanguage();
  const { visible, devPreview, iosSheetOpen, setIosSheetOpen, handleInstall, handleDismiss } =
    useInstallPrompt();

  if (!visible) return null;

  return (
    <>
      <div
        className={cn(
          "h-16 border-b border-[#E3E5E8] bg-white",
          !devPreview && "md:hidden",
          "motion-safe:animate-in motion-safe:slide-in-from-top motion-safe:duration-300",
        )}
      >
        <div className="flex h-full items-center gap-3 px-3">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-xl leading-none text-[#6B7280] focus-ring rounded-sm"
            aria-label={t("installBannerDismiss")}
          >
            ×
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight text-[#1F2328]">
              {t("installBannerAppName")}
            </p>
            <p className="text-[13px] leading-tight text-[#6B7280]">{t("installBannerSubtitle")}</p>
          </div>

          <button
            type="button"
            onClick={() => void handleInstall()}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-ring"
          >
            {t("installBannerInstall")}
          </button>
        </div>
      </div>

      <IosInstallSheet open={iosSheetOpen} onOpenChange={setIosSheetOpen} />
    </>
  );
};

export default InstallBanner;
