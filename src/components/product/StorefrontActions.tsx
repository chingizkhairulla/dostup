import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { rememberAuthNext } from "@/lib/creatorAuth";
import { loginPath, loginState } from "@/lib/loginModal";
import { daysLabel, localizeServerMessage } from "@/lib/serverMessages";
import { invokeApi } from "@/lib/sessionApi";
import type { TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

export type TrialMode = "lesson" | "period";

export interface StorefrontState {
  trialMode: TrialMode | null;
  trial: "none" | "active" | "ended";
  trialEndsAt: string | null;
  lessonHeld: boolean;
  paidActive: boolean;
  paidBefore: boolean;
  revoked: boolean;
  application: { status: "pending" | "allowed" | "closed" | "removed" | "left"; appliedAt: string } | null;
  seatsFull: boolean;
  salesClosed: boolean;
  canBuy: boolean;
  payCode: string | null;
  canStartTrial: boolean;
}

export interface StorefrontProduct {
  id: string;
  slug?: string | null;
  trial_mode?: TrialMode | null;
  trial_button_text?: string | null;
  trial_days?: number | null;
  has_free_trial?: boolean;
  seats_full?: boolean;
  sales_closed?: boolean;
  is_paused?: boolean;
}

/** The trial button when the seller kept the default text: shown in the visitor's language. */
const DEFAULT_TRIAL_KEY: Record<TrialMode, TranslationKey> = {
  lesson: "trialDefaultLesson",
  period: "trialDefaultPeriod",
};

export const productTrialMode = (p: StorefrontProduct): TrialMode | null =>
  p.trial_mode === "lesson" || p.trial_mode === "period" ? p.trial_mode : p.has_free_trial && p.trial_days ? "period" : null;

/** The buyer's state for this product (trial, application, seats); only for a signed-in buyer. */
export function useStorefrontState(productId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["storefront-state", productId],
    queryFn: () =>
      invokeApi<StorefrontState>("checkout", {
        action: "storefront_state",
        productId,
        sessionToken: localStorage.getItem("creator_token") || "",
      }),
    enabled: Boolean(productId) && enabled,
  });
}

type Kind =
  | { type: "buy" }
  | { type: "trial"; text: string }
  | { type: "apply"; waitlist: boolean }
  | { type: "waiting" }
  | { type: "in_waitlist" }
  | { type: "lesson_first" }
  | { type: "no_seats" }
  | { type: "loading" };

/** Which single button the storefront shows (see the rules in _shared/trial.ts on the server). */
export function storefrontButton(
  product: StorefrontProduct,
  state: StorefrontState | undefined,
  guest: boolean,
  t: (key: TranslationKey) => string,
): Kind {
  const mode = productTrialMode(product);
  const trialText = mode ? product.trial_button_text?.trim() || t(DEFAULT_TRIAL_KEY[mode]) : "";
  if (product.sales_closed) return { type: "no_seats" };
  if (guest || !state) {
    if (!guest) return { type: "loading" };
    if (product.seats_full) return { type: "no_seats" };
    return mode ? { type: "trial", text: trialText } : { type: "buy" };
  }
  const app = state.application?.status;
  if (app === "removed" || app === "left") return { type: "no_seats" };
  if (state.paidActive || state.paidBefore) return state.canBuy ? { type: "buy" } : { type: "no_seats" };
  if (app === "allowed") return { type: "buy" };
  if (app === "pending") return { type: "waiting" };
  if (app === "closed") return { type: "in_waitlist" };
  if (!mode) return state.canBuy ? { type: "buy" } : { type: "no_seats" };
  if (state.trial === "none") return state.canStartTrial ? { type: "trial", text: trialText } : { type: "no_seats" };
  if (mode === "lesson") return state.lessonHeld ? { type: "apply", waitlist: false } : { type: "lesson_first" };
  if (state.canBuy) return { type: "buy" };
  return state.payCode === "no_seats" ? { type: "apply", waitlist: true } : { type: "no_seats" };
}

interface Props {
  product: StorefrontProduct;
  /** "Купить" as before (checkout, or the switch-to-buyer prompt). */
  onBuy: () => void;
  buyLabel: string;
  noSeatsLabel: string;
  className?: string;
}

// Long seller texts ("Записаться на пробный урок") fit the narrow phone bar on one or two tidy lines.
const ORANGE =
  "h-12 w-full rounded-2xl bg-[#FF6B00] px-3 text-[15px] font-semibold leading-tight text-white focus-ring hover:bg-[#E86000] disabled:opacity-60 sm:px-6 sm:text-base";
const GREY =
  "h-12 w-full rounded-2xl bg-muted px-3 text-[15px] font-semibold leading-tight text-muted-foreground sm:px-6 sm:text-base";

/**
 * The one button of a product storefront: buy, take the trial, apply after the trial, wait for
 * the seller, or "no seats". Its windows (trial, application, leaving the waiting list) live here.
 */
const StorefrontActions = ({ product, onBuy, buyLabel, noSeatsLabel, className }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { user, profileType } = useSimpleAuth();
  const isBuyer = Boolean(user) && profileType === "buyer";
  const { data: state } = useStorefrontState(product.id, isBuyer);
  const kind = storefrontButton(product, state, !user || !isBuyer, t);

  const [trialOpen, setTrialOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["storefront-state", product.id] });
    void queryClient.invalidateQueries({ queryKey: ["simple-purchases"] });
  };

  const needAccount = () => {
    const back = `${location.pathname}${location.search}`;
    rememberAuthNext(back);
    navigate(loginPath(back), { state: loginState(location) });
  };

  const openTrial = () => {
    if (!user) return needAccount();
    if (!isBuyer) return onBuy(); // the page offers to switch to the buyer profile
    setTrialOpen(true);
  };

  const mode = productTrialMode(product);
  let button: JSX.Element;
  switch (kind.type) {
    case "buy":
      button = (
        <button type="button" onClick={onBuy} className={ORANGE}>
          {buyLabel}
        </button>
      );
      break;
    case "trial":
      button = (
        <button type="button" onClick={openTrial} className={ORANGE}>
          {kind.text}
        </button>
      );
      break;
    case "apply":
      button = (
        <button type="button" onClick={() => setApplyOpen(true)} className={ORANGE}>
          {t("storefrontApply")}
        </button>
      );
      break;
    case "lesson_first":
      // Grey until the trial lesson took place; the hint shows on hover, and on a tap on a phone.
      button = (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled
              onClick={() => toast.info(t("storefrontApplyAfterLesson"))}
              className={cn(GREY, "cursor-not-allowed")}
            >
              {t("storefrontApply")}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("storefrontApplyAfterLesson")}</TooltipContent>
        </Tooltip>
      );
      break;
    case "waiting":
      button = (
        <button type="button" disabled className={GREY}>
          {t("storefrontWaiting")}
        </button>
      );
      break;
    case "in_waitlist":
      button = (
        <button type="button" onClick={() => setLeaveOpen(true)} className={GREY}>
          {t("storefrontInWaitlist")}
        </button>
      );
      break;
    case "loading":
      button = (
        <button type="button" disabled className={cn(GREY, "flex items-center justify-center")}>
          <Loader2 className="h-5 w-5 animate-spin" />
        </button>
      );
      break;
    default:
      button = (
        <div className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-3 text-center text-sm text-foreground">
          {noSeatsLabel}
        </div>
      );
  }

  return (
    <div className={className}>
      {button}
      {mode && (
        <TrialStartDialog
          open={trialOpen}
          onOpenChange={setTrialOpen}
          productId={product.id}
          mode={mode}
          days={product.trial_days ?? 0}
          buttonText={product.trial_button_text}
          initialName={typeof window !== "undefined" ? localStorage.getItem("profile_display_name") ?? "" : ""}
          onDone={() => {
            refresh();
            navigate("/dashboard");
          }}
        />
      )}
      <ApplyDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        productId={product.id}
        waitlist={kind.type === "apply" && kind.waitlist}
        onDone={refresh}
      />
      <LeaveWaitlistDialog open={leaveOpen} onOpenChange={setLeaveOpen} productId={product.id} onDone={refresh} />
    </div>
  );
};

const TrialStartDialog = ({
  open,
  onOpenChange,
  productId,
  mode,
  days,
  buttonText,
  initialName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  mode: TrialMode;
  days: number;
  buttonText?: string | null;
  initialName: string;
  onDone: () => void;
}) => {
  const { t, language } = useLanguage();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  // The seller's own button text tells a consultation from a lesson.
  const consultation = /консультац|кеңес/i.test(buttonText ?? "");
  const info =
    mode === "lesson"
      ? t(consultation ? "trialClosesAfterConsultation" : "trialClosesAfterLesson")
      : t("trialWillLast", { days: daysLabel(days, language) });

  const start = async () => {
    if (!name.trim()) {
      toast.error(t("trialNameRequired"));
      return;
    }
    setBusy(true);
    try {
      await invokeApi("checkout", {
        action: "activate_trial",
        productId,
        displayName: name.trim(),
        // The automatic "trial is open" message from the seller comes in this language.
        lang: language,
        sessionToken: localStorage.getItem("creator_token") || "",
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? localizeServerMessage(e.message, t) : t("trialStartError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="max-w-md gap-4 rounded-2xl">
        <DialogTitle className="text-lg">{t("trialNameTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{info}</DialogDescription>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus className="h-11" />
        <p className="text-sm text-muted-foreground">{info}</p>
        <button type="button" onClick={() => void start()} disabled={busy} className={ORANGE}>
          {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : t("continue")}
        </button>
      </DialogContent>
    </Dialog>
  );
};

const ApplyDialog = ({
  open,
  onOpenChange,
  productId,
  waitlist,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  /** Seats ran out during a "period" trial: the request puts the person on the waiting list. */
  waitlist: boolean;
  onDone: () => void;
}) => {
  const { t } = useLanguage();
  const [want, setWant] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await invokeApi("checkout", {
        action: "apply",
        productId,
        wantToPay: true,
        sessionToken: localStorage.getItem("creator_token") || "",
      });
      onOpenChange(false);
      setWant(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? localizeServerMessage(e.message, t) : t("applyError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="max-w-md gap-3 rounded-2xl">
        <DialogTitle className="text-lg">{t("storefrontApply")}</DialogTitle>
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={want} onCheckedChange={(v) => setWant(v === true)} />
            {t("applyWantToPay")}
          </label>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!want || busy}
            className="h-10 shrink-0 rounded-xl bg-[#FF6B00] px-4 text-sm font-semibold text-white hover:bg-[#E86000] disabled:bg-muted disabled:text-muted-foreground"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("applyConfirm")}
          </button>
        </div>
        <DialogDescription>
          {waitlist ? t("applyWaitlistNote") : t("applyPendingNote")}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
};

const LeaveWaitlistDialog = ({
  open,
  onOpenChange,
  productId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onDone: () => void;
}) => {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    setBusy(true);
    try {
      await invokeApi("checkout", {
        action: "leave_waitlist",
        productId,
        sessionToken: localStorage.getItem("creator_token") || "",
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? localizeServerMessage(e.message, t) : t("leaveWaitlistError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setConfirming(false);
      }}
    >
      <DialogContent hideCloseButton className="max-w-md gap-4 rounded-2xl">
        {confirming ? (
          <>
            <DialogTitle className="text-lg">{t("leaveWaitlistConfirm")}</DialogTitle>
            <DialogDescription className="sr-only">{t("waitlistTitle")}</DialogDescription>
          </>
        ) : (
          <>
            <DialogTitle className="sr-only">{t("waitlistTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-foreground">{t("leaveWaitlistText")}</DialogDescription>
          </>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => (confirming ? void leave() : setConfirming(true))}
            className="flex h-10 min-w-24 items-center justify-center rounded-xl px-5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-ring disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("leaveWaitlistAction")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StorefrontActions;
