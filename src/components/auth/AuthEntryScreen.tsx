import { FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { AuthMark } from "@/components/auth/AuthMark";
import { LOGIN_CARD_CLASS } from "@/lib/loginModal";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface AuthEntryScreenProps {
  email: string;
  onEmailChange: (value: string) => void;
  onContinue: (e: FormEvent) => void;
  onGoogle: () => void;
  onPassword?: () => void;
  sending?: boolean;
  googleLoading?: boolean;
}

const AuthEntryScreen = ({
  email,
  onEmailChange,
  onContinue,
  onGoogle,
  onPassword,
  sending,
  googleLoading,
}: AuthEntryScreenProps) => {
  const { t } = useLanguage();
  const canSubmit = email.trim().includes("@") && email.trim().length >= 3;
  const busy = sending || googleLoading;

  return (
    <Card className={cn(LOGIN_CARD_CLASS, "motion-safe:animate-fade-in")}>
      <CardContent className="space-y-5 px-6 pb-6 pt-14">
        <div className="flex flex-col items-center gap-7 text-center">
          <AuthMark variant="brand" className="h-9 w-auto object-center" />
          <h1 className="text-2xl font-bold leading-[1.25] tracking-tight">{t("authTagline")}</h1>
        </div>

        <form onSubmit={onContinue} className="space-y-3">
          <Input
            id="entryEmail"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="h-12 rounded-xl"
            autoFocus
            disabled={busy}
          />
          <Button
            type="submit"
            variant="cta"
            size="lg"
            className="w-full bg-[#FF6B00]"
            disabled={busy || !canSubmit}
          >
            {sending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("processing")}
              </span>
            ) : (
              t("continue")
            )}
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("or")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <GoogleSignInButton loading={googleLoading} disabled={sending} onClick={onGoogle} />

        {onPassword && (
          <button
            type="button"
            className="block w-full text-center text-xs text-muted-foreground hover:text-[#FF6B00] transition-colors"
            onClick={onPassword}
            disabled={busy}
          >
            {t("signInWithPassword")}
          </button>
        )}

        <p className="text-center text-[12px] leading-relaxed text-[#6B7280]">
          {t("authConsentPrefix")}{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[#1F2328] focus-ring rounded-sm"
          >
            {t("authConsentTerms")}
          </a>{" "}
          {t("authConsentAnd")}{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[#1F2328] focus-ring rounded-sm"
          >
            {t("authConsentPrivacy")}
          </a>
        </p>
      </CardContent>
    </Card>
  );
};

export default AuthEntryScreen;
