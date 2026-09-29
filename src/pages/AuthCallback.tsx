import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { parseCallbackError } from "@/lib/authErrors";
import { exchangeCreatorSession } from "@/lib/creatorAuth";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";

type CallbackPhase = "exchanging" | "error";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { applySession, startOnboarding } = useSimpleAuth();
  const [phase, setPhase] = useState<CallbackPhase>("exchanging");
  const [message, setMessage] = useState(t("authExchanging"));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const started = useRef(false);

  const logFailure = useCallback((detail: string, context: Record<string, unknown>) => {
    console.error("[auth/callback]", detail, context);
  }, []);

  const exchangeSession = useCallback(
    async (session: Session) => {
      sessionRef.current = session;
      setPhase("exchanging");
      setMessage(t("authExchanging"));
      setErrorMessage(null);

      const result = await exchangeCreatorSession(session);
      if (result.error) {
        const raw = result.error.message || result.error.code || "exchange_failed";
        logFailure("creator session exchange failed", {
          error: raw,
          code: result.error.code,
        });
        setErrorMessage(raw);
        setPhase("error");
        return;
      }
      if (result.session) {
        applySession(result.session);
      } else if (result.onboarding) {
        startOnboarding(result.onboarding.token, result.onboarding.creatorName);
      }
      if (result.path) {
        navigate(result.path, { replace: true });
      }
    },
    [applySession, logFailure, navigate, startOnboarding, t],
  );

  const obtainSupabaseSession = useCallback(async (): Promise<Session | null> => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        logFailure("exchangeCodeForSession failed", {
          hasCode: true,
          hasFragment: Boolean(window.location.hash),
          error: error.message,
        });
        setErrorMessage(error.message);
        setPhase("error");
        return null;
      }
      return data.session;
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        logFailure("setSession from fragment failed", {
          hasCode: false,
          hasFragment: true,
          error: error.message,
        });
        setErrorMessage(error.message);
        setPhase("error");
        return null;
      }
      return data.session;
    }

    const urlError = parseCallbackError();
    const detail = urlError || "no_session";
    logFailure("no Supabase session in callback URL", {
      hasCode: false,
      hasFragment: Boolean(window.location.hash),
      hash: window.location.hash,
      search: window.location.search,
      error: detail,
    });
    setErrorMessage(detail);
    setPhase("error");
    return null;
  }, [logFailure]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlError = parseCallbackError();

      if (!params.has("code") && urlError && urlError !== "account_type_required") {
        logFailure("callback URL error", {
          hasCode: false,
          hasFragment: Boolean(window.location.hash),
          error: urlError,
        });
        setErrorMessage(urlError);
        setPhase("error");
        return;
      }

      const session = await obtainSupabaseSession();
      if (!session) return;
      await exchangeSession(session);
    })();
  }, [exchangeSession, logFailure, obtainSupabaseSession]);

  const handleRetry = () => {
    const session = sessionRef.current;
    if (!session) return;
    void exchangeSession(session);
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-card border shadow-sm px-6 py-12 flex flex-col items-center gap-4">
        {phase === "exchanging" ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground text-center">{message}</p>
          </>
        ) : (
          <>
            <p className="text-sm text-destructive text-center break-words">{errorMessage}</p>
            {sessionRef.current ? (
              <Button type="button" variant="outline" onClick={handleRetry}>
                {t("authRetryExchange")}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
