import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthSplash from "@/components/auth/AuthSplash";
import RoleSelectionScreen from "@/components/auth/RoleSelectionScreen";
import SellerProfileSetupScreen from "@/components/auth/SellerProfileSetupScreen";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { invalidateAvatarQueries, uploadProfileAvatar } from "@/lib/avatarUpload";
import { consumeAuthNext, isPurchaseIntentPath, peekAuthNext, profileHomePath, type ProfileType } from "@/lib/creatorAuth";

const NAME_TAKEN_MESSAGE = "Это название уже используется. Выберите другое.";

/**
 * First screen for a signed-in identity without profiles: pick a role,
 * create that profile and open it.
 */
const WelcomePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { status, needsOnboarding, profileType, createProfile, setProfileAvatar, logout } = useSimpleAuth();
  const [step, setStep] = useState<"role" | "setup">("role");
  const [sellerType, setSellerType] = useState<"creator" | "school" | null>(null);
  const [saving, setSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading" || saving) return;
    if (status === "guest") {
      navigate("/login", { replace: true });
      return;
    }
    if (!needsOnboarding && profileType) {
      navigate(profileHomePath(profileType, localStorage.getItem("creator_account_type")), { replace: true });
    }
  }, [navigate, needsOnboarding, profileType, saving, status]);

  const create = async (type: ProfileType, displayName: string) => {
    const result = await createProfile({ profileType: type, displayName });
    if ("error" in result) {
      const message = result.error.includes("name_taken") ? NAME_TAKEN_MESSAGE : t("switchProfileError");
      return { ok: false as const, message };
    }
    return { ok: true as const, path: result.path };
  };

  const handleRole = async (type: ProfileType) => {
    if (type === "creator" || type === "school") {
      setSellerType(type);
      setSetupError(null);
      setStep("setup");
      return;
    }
    setSaving(true);
    try {
      const result = await create("buyer", "");
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // A buyer usually signed in from a product page; return there.
      navigate(consumeAuthNext() || result.path, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  // Came from a product or its checkout: this person is buying, so skip the role picker.
  const autoBuyer = useRef(false);
  const [autoCreating, setAutoCreating] = useState(() => isPurchaseIntentPath(peekAuthNext()));
  useEffect(() => {
    if (status !== "authenticated" || !needsOnboarding || autoBuyer.current) return;
    if (!isPurchaseIntentPath(peekAuthNext())) {
      setAutoCreating(false);
      return;
    }
    autoBuyer.current = true;
    void handleRole("buyer").finally(() => setAutoCreating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, needsOnboarding]);

  const handleSellerSetup = async (displayName: string, avatarFile: File | null) => {
    if (!sellerType) return;
    setSaving(true);
    setSetupError(null);
    try {
      const result = await create(sellerType, displayName);
      if (!result.ok) {
        setSetupError(result.message);
        return;
      }
      if (avatarFile) {
        try {
          const url = await uploadProfileAvatar(avatarFile);
          setProfileAvatar(url);
          invalidateAvatarQueries(queryClient);
        } catch {
          toast.error(t("avatarSaveError"));
        }
      }
      // Sellers go straight to their new dashboard.
      consumeAuthNext();
      navigate(result.path, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (saving) return;
    setStep("role");
    setSellerType(null);
  };

  const handleSignOut = async () => {
    if (saving) return;
    await logout();
    navigate("/", { replace: true });
  };

  if (status === "loading" || autoCreating || (!needsOnboarding && !saving)) {
    return <AuthSplash />;
  }

  return (
    <div className="flex min-h-screen items-stretch justify-center bg-background sm:items-center sm:bg-muted/40 sm:p-6">
      {step === "role" && (
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={saving}
          className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm text-[#1F2328] transition-colors hover:bg-destructive/10 hover:text-destructive focus-ring disabled:opacity-50 sm:left-5 sm:top-5"
          aria-label={t("signOut")}
        >
          <LogOut className="h-4 w-4" />
          <span>{t("signOut")}</span>
        </button>
      )}
      <div className="relative flex w-full flex-col motion-safe:animate-fade-in sm:max-w-md">
        {step === "setup" && (
          <button
            type="button"
            onClick={handleBack}
            disabled={saving}
            className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm text-[#1F2328] transition-colors hover:bg-[#F6F7F8] focus-ring disabled:opacity-50"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {step === "setup" && sellerType ? (
          <SellerProfileSetupScreen
            saving={saving}
            errorMessage={setupError}
            onContinue={(displayName, avatarFile) => void handleSellerSetup(displayName, avatarFile)}
          />
        ) : (
          <RoleSelectionScreen onSelect={handleRole} />
        )}
      </div>
    </div>
  );
};

export default WelcomePage;
