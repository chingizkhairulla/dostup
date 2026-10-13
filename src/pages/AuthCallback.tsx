import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Loader2, AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { parseCallbackError } from "@/lib/authErrors";
import { exchangeCreatorSession } from "@/lib/creatorAuth";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";

type CallbackPhase = "exchanging" | "error";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
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
    async (session: Session, retryCount = 0) => {
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
          retryCount,
        });

        // Auto-retry up to 2 times (e.g. for temporary server clock drift / gateway latency)
        if (retryCount < 2) {
          setTimeout(() => {
            void exchangeSession(session, retryCount + 1);
          }, 1500);
          return;
        }

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

  const obtainSupabaseSession = useCallback(async (retryCount = 0): Promise<Session | null> => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        logFailure("exchangeCodeForSession failed", {
          hasCode: true,
          hasFragment: Boolean(window.location.hash),
          error: error.message,
          retryCount,
        });
        if (retryCount < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          return obtainSupabaseSession(retryCount + 1);
        }
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
          retryCount,
        });
        if (retryCount < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          return obtainSupabaseSession(retryCount + 1);
        }
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
    if (session) {
      void exchangeSession(session);
    } else {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-card border shadow-sm px-6 py-8 flex flex-col items-center text-center">
        {phase === "exchanging" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-5 w-full">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-primary" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-foreground">
                {language === "ru" ? "Что-то пошло не так" : "Бірдеңе дұрыс болмады"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {language === "ru"
                  ? "Не беспокойтесь, это временная ошибка при входе. Попробуйте еще раз."
                  : "Уайымдамаңыз, бұл кіру кезіндегі уақытша қате. Қайталап көріңіз."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 w-full pt-2">
              <Button
                type="button"
                onClick={handleRetry}
                className="flex-1 bg-primary hover:bg-primary/90 text-white gap-2 font-medium"
              >
                <RefreshCw className="w-4 h-4 text-white" />
                {language === "ru" ? "Попробовать снова" : "Қайталап көру"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoHome}
                className="flex-1 border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40 gap-2 font-medium"
              >
                <Home className="w-4 h-4" />
                {language === "ru" ? "На главную" : "Басты бетке"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
