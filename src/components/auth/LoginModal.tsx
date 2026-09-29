import { ReactNode, useEffect } from "react";
import BackArrowButton from "@/components/ui/BackArrowButton";
import { useLanguage } from "@/contexts/LanguageContext";

type LoginModalProps = {
  children: ReactNode;
  onClose: () => void;
};

const LoginModal = ({ children, onClose }: LoginModalProps) => {
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
        <BackArrowButton
          onClick={onClose}
          aria-label={t("back")}
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20"
        />
        {children}
      </div>
    </div>
  );
};

export default LoginModal;
