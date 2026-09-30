import type { ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMaterialsScreenProtection } from "@/hooks/useMaterialsScreenProtection";

interface MaterialsScreenGuardProps {
  children: ReactNode;
}

const MaterialsScreenGuard = ({ children }: MaterialsScreenGuardProps) => {
  const { language } = useLanguage();
  const { status, shouldHideContent } = useMaterialsScreenProtection();

  if (!shouldHideContent) return <>{children}</>;

  const isKk = language === "kk";
  const showRecordingMessage = status === "captured";
  const showProtectionError = status === "error";

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-black px-6 text-white"
      role={showRecordingMessage || showProtectionError ? "alert" : undefined}
      aria-live={showRecordingMessage || showProtectionError ? "assertive" : undefined}
      data-screen-protection-status={status}
    >
      {showRecordingMessage && (
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold sm:text-2xl">
            {isKk ? "Экран жазбасын өшіріңіз." : "Выключите запись экрана."}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80 sm:text-base">
            {isKk
              ? "Қолданба экранды жазуға тыйым салады, жұмысты жалғастыру үшін экран жазбасын өшіру қажет."
              : "Запись экрана запрещена приложением, для продолжения работы необходимо выключить запись."}
          </p>
        </div>
      )}

      {showProtectionError && (
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold sm:text-2xl">
            {isKk ? "Экранды қорғау қолжетімсіз." : "Защита экрана недоступна."}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80 sm:text-base">
            {isKk
              ? "Қолданбаны жауып, қайта ашыңыз."
              : "Закройте приложение и откройте его снова."}
          </p>
        </div>
      )}
    </div>
  );
};

export default MaterialsScreenGuard;
