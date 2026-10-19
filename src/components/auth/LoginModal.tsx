import { ReactNode, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type LoginModalProps = {
  children: ReactNode;
  onClose: () => void;
  hideBack?: boolean;
};

const LoginModal = ({ children, onClose, hideBack }: LoginModalProps) => {
  const { t } = useLanguage();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6">
      <div
        className="login-modal-backdrop absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("signIn")}
        className="relative z-10 flex h-full w-full flex-col motion-safe:animate-fade-in sm:h-auto sm:max-w-md"
      >
        {!hideBack && (
          <button
            type="button"
            onClick={onClose}
            className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-9 w-9 items-center justify-center rounded-xl text-[#1F2328] transition-colors hover:bg-[#F6F7F8] focus-ring"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
};

export default LoginModal;
