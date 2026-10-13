import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  exchangeCreatorAccessToken,
  profileHomePath,
  storeCreatorSession,
  parseProfileType,
} from "@/lib/creatorAuth";
import { LOGIN_CARD_CLASS } from "@/lib/loginModal";
import { cn } from "@/lib/utils";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PasswordLoginScreenProps {
  onBack: () => void;
}

const PasswordLoginScreen = ({ onBack }: PasswordLoginScreenProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { applySession, startOnboarding } = useSimpleAuth();
  const [loginValue, setLoginValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({});

  const isFormValid = loginValue.trim().length >= 2 && passwordValue.trim().length >= 2;

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: { login?: string; password?: string } = {};
    if (loginValue.trim().length < 2) nextErrors.login = t("minNameLength");
    if (passwordValue.trim().length < 2) nextErrors.password = t("minNameLength");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setIsSubmitting(true);

    const loginName = loginValue.trim();
    const password = passwordValue;

    if (loginName.toLowerCase() === "moderator") {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-moderator-password`;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ login: loginName, password }),
        });
        const data = await resp.json();
        if (resp.ok && data?.success) {
          localStorage.setItem("moderator_token", data.token);
          navigate("/moderator");
          setIsSubmitting(false);
          return;
        }
        toast.error(t("invalidCredentials"));
        setIsSubmitting(false);
        return;
      } catch {
        toast.error(t("networkFailure"));
        setIsSubmitting(false);
        return;
      }
    }

    try {
      let emailToTry = loginName;
      if (!loginName.includes("@")) {
        const { data: acc } = await supabase
          .from("creator_accounts")
          .select("email")
          .ilike("login", loginName)
          .maybeSingle();
        if (acc?.email) {
          emailToTry = acc.email;
        }
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailToTry,
        password,
      });

      if (!authError && authData?.session) {
        const exchangeResult = await exchangeCreatorAccessToken(authData.session.access_token, emailToTry);
        if (exchangeResult.session) {
          applySession(exchangeResult.session);
          if (exchangeResult.path) {
            navigate(exchangeResult.path, { replace: true });
            setIsSubmitting(false);
            return;
          }
        } else if (exchangeResult.onboarding) {
          startOnboarding(exchangeResult.onboarding.token, exchangeResult.onboarding.creatorName);
          if (exchangeResult.path) {
            navigate(exchangeResult.path, { replace: true });
            setIsSubmitting(false);
            return;
          }
        }
      }
    } catch {
      // ignore, fallback to verify-creator-password
    }

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-creator-password`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ password, creatorName: loginName }),
      });
      if (resp.ok) {
        const cData = await resp.json();
        if (cData?.success && cData.token) {
          const profileType = parseProfileType(cData.profileType)
            || (cData.accountType === "online_school" ? "school" : "creator");
          storeCreatorSession({
            token: cData.token,
            creatorName: cData.creatorName || loginName,
            accountType: cData.accountType,
            profileType,
            profileId: cData.profileId,
            displayName: cData.displayName,
            profiles: cData.profiles,
          });
          navigate(profileHomePath(profileType, cData.accountType));
          setIsSubmitting(false);
          return;
        }
      }
      toast.error(t("invalidCredentials"));
    } catch {
      toast.error(t("networkFailure"));
    }
    setIsSubmitting(false);
  };

  return (
    <Card className={cn(LOGIN_CARD_CLASS, "motion-safe:animate-fade-in")}>
      <CardHeader className="pb-2">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button variant="ghost" size="sm" className="px-2 -ml-2" onClick={onBack} aria-label={t("back")}>
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">{t("back")}</span>
          </Button>
          <CardTitle className="text-xl font-bold text-center truncate">{t("signInWithPassword")}</CardTitle>
          <span className="w-8 sm:w-16" aria-hidden />
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loginField">{t("loginField")}</Label>
            <Input
              id="loginField"
              type="text"
              placeholder={t("loginPlaceholder")}
              value={loginValue}
              onChange={(e) => {
                setLoginValue(e.target.value);
                if (errors.login) setErrors((prev) => ({ ...prev, login: undefined }));
              }}
              required
              className={`h-12 ${errors.login ? "border-destructive" : ""}`}
            />
            {errors.login && <p className="text-sm text-destructive">{errors.login}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="passwordField">{t("passwordField")}</Label>
            <div className="relative">
              <Input
                id="passwordField"
                type={showPassword ? "text" : "password"}
                placeholder={t("passwordPlaceholder")}
                value={passwordValue}
                onChange={(e) => {
                  setPasswordValue(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                required
                className={`h-12 pr-10 ${errors.password ? "border-destructive" : ""}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-12 px-3"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
          </div>

          <Button
            type="submit"
            variant="cta"
            size="lg"
            className="w-full bg-[#FF6B00] text-white hover:bg-[#FF6B00]/90"
            disabled={isSubmitting || !isFormValid}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                {t("processing")}
              </span>
            ) : (
              t("login")
            )}
          </Button>

          <button
            type="button"
            className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => toast.info(t("forgotPasswordHint"))}
          >
            {t("forgotPassword")}
          </button>
        </form>
      </CardContent>
    </Card>
  );
};

export default PasswordLoginScreen;
