import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { authErrorKeyFromUnknown } from "@/lib/authErrors";
import {
  exchangeCreatorAccessToken,
  sendEmailCode,
  startGoogleOAuth,
  verifyEmailCode,
  type GoogleOAuthResult,
} from "@/lib/creatorAuth";
import { getTestAccountEmail, TEST_ACCOUNT_PASSWORD } from "@/lib/testAccounts";

type UseEmailAuthOptions = {
  onAuthRedirect?: (path: string) => void | Promise<void>;
};

type PendingExchange = {
  accessToken: string;
  address: string;
};

export function useEmailAuth(options: UseEmailAuthOptions = {}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { applySession, startOnboarding } = useSimpleAuth();
  const { onAuthRedirect } = options;
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [retryingExchange, setRetryingExchange] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const submitting = useRef(false);
  const pendingExchange = useRef<PendingExchange | null>(null);

  const redirectAfterAuth = async (path: string) => {
    if (onAuthRedirect) {
      await onAuthRedirect(path);
      return;
    }
    navigate(path, { replace: true });
  };

  const exchange = async (accessToken: string, address: string) => {
    const result = await exchangeCreatorAccessToken(accessToken, address);
    if (result.error) {
      const raw = result.error.message || result.error.code || "exchange_failed";
      pendingExchange.current = { accessToken, address };
      setExchangeError(raw);
      return false;
    }

    pendingExchange.current = null;
    setExchangeError(null);
    if (result.session) {
      applySession(result.session);
    } else if (result.onboarding) {
      startOnboarding(result.onboarding.token, result.onboarding.creatorName);
    }
    if (result.path) {
      await redirectAfterAuth(result.path);
    }
    return true;
  };

  const retryExchange = async () => {
    const pending = pendingExchange.current;
    if (!pending || retryingExchange) return false;
    setRetryingExchange(true);
    try {
      return await exchange(pending.accessToken, pending.address);
    } finally {
      setRetryingExchange(false);
    }
  };

  const sendCode = async (address: string) => {
    const trimmed = address.trim().toLowerCase();
    if (!trimmed.includes("@") || trimmed.length < 3) {
      toast.error(t("invalidEmail"));
      return false;
    }
    setSending(true);
    const { error } = await sendEmailCode(trimmed);
    setSending(false);
    if (error) {
      toast.error(t(authErrorKeyFromUnknown(error)));
      return false;
    }
    setExchangeError(null);
    pendingExchange.current = null;
    setPendingEmail(trimmed);
    return true;
  };

  const verifyCode = async (token: string): Promise<boolean | null> => {
    if (!pendingEmail || submitting.current) return null;
    submitting.current = true;
    setVerifying(true);
    setExchangeError(null);
    try {
      const { data, error } = await verifyEmailCode(pendingEmail, token);
      if (error || !data.session?.access_token) {
        toast.error(t(authErrorKeyFromUnknown(error || { message: "wrong_email_code", code: "wrong_email_code" })));
        return null;
      }
      return await exchange(data.session.access_token, pendingEmail);
    } catch {
      toast.error(t("networkFailure"));
      return null;
    } finally {
      submitting.current = false;
      setVerifying(false);
    }
  };

  const handleGoogle = async (): Promise<GoogleOAuthResult> => {
    setGoogleLoading(true);
    try {
      return await startGoogleOAuth();
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleContinue = async (address: string): Promise<"code" | "authenticated" | "error"> => {
    const testEmail = getTestAccountEmail(address);
    if (testEmail) {
      setSending(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: TEST_ACCOUNT_PASSWORD,
        });
        if (error || !data.session?.access_token) {
          toast.error(t(authErrorKeyFromUnknown(error || { message: "invalid_credentials" })));
          return "error";
        }
        const success = await exchange(data.session.access_token, testEmail);
        return success ? "authenticated" : "error";
      } catch {
        toast.error(t("networkFailure"));
        return "error";
      } finally {
        setSending(false);
      }
    }

    const ok = await sendCode(address);
    return ok ? "code" : "error";
  };

  return {
    email,
    setEmail,
    pendingEmail,
    setPendingEmail,
    googleLoading,
    sending,
    verifying,
    retryingExchange,
    exchangeError,
    canRetryExchange: Boolean(pendingExchange.current && exchangeError),
    busy: googleLoading || sending || verifying || retryingExchange,
    sendCode,
    handleContinue,
    verifyCode,
    retryExchange,
    handleGoogle,
  };
}
