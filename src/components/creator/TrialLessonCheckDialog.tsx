import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { kk, ru } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";

interface Check {
  product_id: string;
  product_title: string;
  buyer_profile_id: string;
  buyer_name: string;
  time_slot_id: string;
  date: string;
  start_time: string;
  end_time: string;
}

/**
 * "Пробный урок прошёл?" after the slot a trial buyer booked is over. Only "Да" or "Нет": the
 * window cannot be closed any other way. "Да" closes the trial; "Нет" lets them book again, and
 * the question comes back after that slot.
 */
const TrialLessonCheckDialog = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const { data: checks = [] } = useQuery({
    queryKey: ["trial-lesson-checks"],
    queryFn: async () =>
      (await invokeApi<{ checks: Check[] }>("manage-bookings", { action: "trial_lesson_checks", ...creatorCreds() })).checks ?? [],
    refetchInterval: 5 * 60 * 1000,
  });
  const check = checks[0];

  const answer = async (held: boolean) => {
    if (!check) return;
    setBusy(held ? "yes" : "no");
    try {
      await invokeApi("manage-bookings", {
        action: "answer_trial_lesson",
        ...creatorCreds(),
        productId: check.product_id,
        buyerProfileId: check.buyer_profile_id,
        timeSlotId: check.time_slot_id,
        held,
      });
      await queryClient.invalidateQueries({ queryKey: ["trial-lesson-checks"] });
      void queryClient.invalidateQueries({ queryKey: ["creator-purchases"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  };

  const button =
    "flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-60";

  return (
    <Dialog open={!!check}>
      <DialogContent
        hideCloseButton
        className="max-w-sm gap-4 rounded-2xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-lg">{t("trialLessonHeldQuestion")}</DialogTitle>
        {check && (
          <DialogDescription>
            {check.buyer_name} · {check.product_title} ·{" "}
            {format(parseISO(check.date), "d MMMM", { locale: language === "kk" ? kk : ru })}, {check.start_time.slice(0, 5)}–{check.end_time.slice(0, 5)}
          </DialogDescription>
        )}
        <div className="flex gap-2">
          <button type="button" className={button} disabled={busy !== null} onClick={() => void answer(true)}>
            {busy === "yes" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("yes")}
          </button>
          <button type="button" className={button} disabled={busy !== null} onClick={() => void answer(false)}>
            {busy === "no" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("no")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TrialLessonCheckDialog;
