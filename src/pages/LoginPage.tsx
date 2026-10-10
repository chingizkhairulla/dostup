import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import AuthEntryScreen from "@/components/auth/AuthEntryScreen";
import EmailCodeScreen from "@/components/auth/EmailCodeScreen";
import LoginModal from "@/components/auth/LoginModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useEmailAuth } from "@/hooks/useEmailAuth";
import { authErrorKeyFromUnknown, authErrorTranslationKey } from "@/lib/authErrors";
import {
  isSafeInternalPath,
  ONBOARDING_PATH,
  profileHomePath,
  rememberAuthNext,
} from "@/lib/creatorAuth";
import { LOGIN_CARD_CLASS, readLoginBackground } from "@/lib/loginModal";
import { cn } from "@/lib/utils";

type Screen = "entry" | "code";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, profileType, sessionToken, needsOnboarding } = useSimpleAuth();
  const { t } = useLanguage();
  const [screen, setScreen] = useState<Screen>("entry");
  const signedIn = status === "authenticated" && Boolean(sessionToken && profileType);
  const nextPath = searchParams.get("next");

  const closeModal = useCallback(() => {
    if (readLoginBackground(location.state)) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  }, [location.state, navigate]);

  const applyAuthRedirect = useCallback(
    async (path: string) => {
      navigate(path, { replace: true });
    },
    [navigate],
  );

  const auth = useEmailAuth({ onAuthRedirect: applyAuthRedirect });

  const handleModalBack = useCallback(() => {
    if (screen === "code") {
      auth.setPendingEmail(null);
      setScreen("entry");
      return;
    }
    closeModal();
  }, [auth, closeModal, screen]);

  useEffect(() => {
    const background = readLoginBackground(location.state);
    if (background) {
      rememberAuthNext(`${background.pathname}${background.search}${background.hash}`);
    }
    if (nextPath) rememberAuthNext(nextPath);
  }, [location.state, nextPath]);

  useEffect(() => {
    const authError = searchParams.get("auth_error");
    if (!authError) return;
    toast.error(t(authErrorTranslationKey(authError)));
    searchParams.delete("auth_error");
    setSearchParams(searchParams, { replace: true, state: location.state });
  }, [location.state, searchParams, setSearchParams, t]);

  useEffect(() => {
    if (status === "loading") return;
    if (screen === "code") return;
    if (needsOnboarding && sessionToken) {
      navigate(ONBOARDING_PATH, { replace: true });
      return;
    }
    if (signedIn) {
      const destination =
        isSafeInternalPath(nextPath) && nextPath !== "/"
          ? nextPath
          : profileHomePath(profileType || "buyer", localStorage.getItem("creator_account_type"));
      navigate(destination, { replace: true });
    }
  }, [navigate, needsOnboarding, nextPath, profileType, screen, sessionToken, signedIn, status]);

  const handleContinue = async (e: FormEvent) => {
    e.preventDefault();
    const result = await auth.handleContinue(auth.email);
    if (result === "code") setScreen("code");
  };

  const handleGoogle = async () => {
    const result = await auth.handleGoogle();
    if (result.error) {
      toast.error(t(authErrorKeyFromUnknown(result.error)));
    }
  };

  const spinner = (
    <div className={cn(LOGIN_CARD_CLASS, "flex items-center justify-center bg-background sm:min-h-[280px] sm:bg-card")}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const body =
    status === "loading" ? (
      spinner
    ) : screen === "code" && auth.pendingEmail ? (
      <EmailCodeScreen
        email={auth.pendingEmail}
        verifying={auth.verifying}
        sending={auth.sending}
        exchangeError={auth.exchangeError}
        retryingExchange={auth.retryingExchange}
        onVerify={async (code) => {
          await auth.verifyCode(code);
        }}
        onResend={async () => {
          await auth.sendCode(auth.pendingEmail || auth.email);
        }}
        onRetryExchange={async () => {
          await auth.retryExchange();
        }}
      />
    ) : screen === "entry" && !signedIn ? (
      <AuthEntryScreen
        email={auth.email}
        onEmailChange={auth.setEmail}
        onContinue={(e) => void handleContinue(e)}
        onGoogle={() => void handleGoogle()}
        sending={auth.sending}
        googleLoading={auth.googleLoading}
      />
    ) : (
      spinner
    );

  return <LoginModal onClose={handleModalBack}>{body}</LoginModal>;
};

export default LoginPage;
