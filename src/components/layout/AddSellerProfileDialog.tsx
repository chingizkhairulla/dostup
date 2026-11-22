import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import RoleSelectionScreen from "@/components/auth/RoleSelectionScreen";
import SellerProfileSetupScreen from "@/components/auth/SellerProfileSetupScreen";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { type ProfileType } from "@/lib/creatorAuth";
import { cn } from "@/lib/utils";

type AddSellerProfileDialogProps = {
  open: boolean;
  creating?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    type: ProfileType,
    displayName: string,
    avatarFile: File | null
  ) => Promise<boolean | { ok: boolean; error?: string } | void> | boolean | void;
};

const SELLER_TYPES: ProfileType[] = ["creator"];
// An identity can own one buyer profile (unique index), so it is offered only while missing.
const ALL_TYPES: ProfileType[] = ["buyer", ...SELLER_TYPES];

const AddSellerProfileDialog = ({
  open,
  creating = false,
  onOpenChange,
  onConfirm,
}: AddSellerProfileDialogProps) => {
  const { t } = useLanguage();
  const { profiles } = useSimpleAuth();
  const availableTypes = profiles.some((profile) => profile.type === "buyer") ? SELLER_TYPES : ALL_TYPES;
  const [step, setStep] = useState<"role" | "setup">("role");
  const [pendingType, setPendingType] = useState<"creator" | "school" | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setStep("role");
    setPendingType(null);
    setSetupError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => {
    if (creating) return;
    onOpenChange(false);
  };

  const goBack = () => {
    if (creating) return;
    if (step === "setup") {
      setStep("role");
      setPendingType(null);
      return;
    }
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (creating) return;
      if (step === "setup") {
        setStep("role");
        setPendingType(null);
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, creating, step, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // The role step is a card even on a phone, so a tap around it closes the window.
    <div
      className={cn(
        "fixed inset-0 z-[80] flex justify-center sm:items-center sm:p-6",
        step === "setup" ? "items-stretch" : "items-center p-4",
      )}
    >
      <div
        className="login-modal-backdrop absolute inset-0"
        onClick={close}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("addSellerProfile")}
        className={cn(
          "relative z-10 flex w-full flex-col motion-safe:animate-fade-in sm:h-auto sm:max-w-md",
          step === "setup" ? "h-full" : "max-w-md",
        )}
      >
        {/* The role step closes with a tap outside; only the profile step has a way back. */}
        {step === "setup" && (
          <button
            type="button"
            onClick={goBack}
            disabled={creating}
            className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-9 w-9 items-center justify-center rounded-xl text-[#1F2328] transition-colors hover:bg-[#F6F7F8] focus-ring disabled:opacity-50"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {step === "setup" && pendingType ? (
          <SellerProfileSetupScreen
            saving={creating}
            errorMessage={setupError}
            onContinue={async (displayName, avatarFile) => {
              setSetupError(null);
              const res = await onConfirm(pendingType, displayName, avatarFile);
              if (res && typeof res === "object" && "error" in res && res.error) {
                setSetupError(res.error);
              }
            }}
          />
        ) : (
          <RoleSelectionScreen
            compact
            types={availableTypes}
            onSelect={async (type) => {
              if (type === "buyer") {
                // A buyer profile needs no name/avatar step.
                await onConfirm("buyer", "", null);
                return;
              }
              setPendingType(type);
              setStep("setup");
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
};

export default AddSellerProfileDialog;
