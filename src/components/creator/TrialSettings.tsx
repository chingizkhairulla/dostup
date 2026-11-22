import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { daysLabel } from "@/lib/serverMessages";
import { translations, type TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

export type TrialMode = "lesson" | "period";

export const TRIAL_DEFAULT_TEXT: Record<TrialMode, string> = {
  lesson: "Записаться на пробный урок",
  period: "Получить пробный доступ",
};

export interface TrialValue {
  enabled: boolean;
  mode: TrialMode;
  days: number;
  /** Button text on the storefront, per kind, so switching between them keeps what was typed. */
  texts: Record<TrialMode, string>;
}

export const emptyTrial = (): TrialValue => ({
  enabled: false,
  mode: "lesson",
  days: 7,
  texts: { ...TRIAL_DEFAULT_TEXT },
});

const OPTIONS: { mode: TrialMode; title: TranslationKey; description: TranslationKey }[] = [
  { mode: "lesson", title: "trialModeLesson", description: "trialModeLessonNote" },
  { mode: "period", title: "trialModePeriod", description: "trialModePeriodNote" },
];

/**
 * The untouched default text in any language: saved as "no text of the seller's own", so every
 * visitor sees the default in their own language.
 */
export const isDefaultTrialText = (text: string) => {
  const v = text.trim();
  return (["ru", "kk"] as const).some(
    (lang) => v === translations[lang].trialDefaultLesson || v === translations[lang].trialDefaultPeriod,
  );
};

/** The default button texts in the seller's language. */
export const trialDefaultTexts = (t: (key: TranslationKey) => string): Record<TrialMode, string> => ({
  lesson: t("trialDefaultLesson"),
  period: t("trialDefaultPeriod"),
});

const DAY_PRESETS = [3, 7, 30];

/**
 * "Бесплатный пробный" under the payment options: one trial for the whole product, applied to
 * every payment option. "Lesson" makes buying possible only with the seller's permission,
 * "Period" leaves buying free.
 */
const TrialSettings = ({ value, onChange }: { value: TrialValue; onChange: (next: TrialValue) => void }) => {
  const { t, language } = useLanguage();
  const set = (patch: Partial<TrialValue>) => onChange({ ...value, ...patch });

  // An untouched default text follows the seller's interface language.
  useEffect(() => {
    const local = trialDefaultTexts(t);
    const next = { ...value.texts };
    let changed = false;
    for (const mode of ["lesson", "period"] as TrialMode[]) {
      if (isDefaultTrialText(next[mode]) && next[mode] !== local[mode]) {
        next[mode] = local[mode];
        changed = true;
      }
    }
    if (changed) onChange({ ...value, texts: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, value.texts.lesson, value.texts.period]);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4" id="field-trial">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-sm font-medium sm:text-base">{t("trialFree")}</span>
        <Switch checked={value.enabled} onCheckedChange={(enabled) => set({ enabled })} />
      </label>

      {value.enabled && (
        <div className="space-y-2 border-t border-border/60 pt-3" role="radiogroup">
          {OPTIONS.map((option) => {
            const selected = value.mode === option.mode;
            return (
              <div
                key={option.mode}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-primary/5",
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set({ mode: option.mode })}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      selected ? "border-primary bg-primary" : "border-muted-foreground/40",
                    )}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-foreground">{t(option.title)}</span>
                    <span className="block text-xs text-muted-foreground sm:text-sm">{t(option.description)}</span>
                  </span>
                </button>

                {selected && (
                  <div className="mt-3 space-y-3 pl-7">
                    {option.mode === "period" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground sm:text-sm">{t("trialDuration")}</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          {DAY_PRESETS.map((days) => (
                            <Button
                              key={days}
                              type="button"
                              size="sm"
                              variant={value.days === days ? "default" : "toggle"}
                              onClick={() => set({ days })}
                              className="h-9 text-xs sm:text-sm"
                            >
                              {daysLabel(days, language)}
                            </Button>
                          ))}
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              aria-label={t("trialDaysCount")}
                              value={value.days || ""}
                              onChange={(e) => set({ days: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                              className="h-9 w-20 text-sm"
                            />
                            <span className="text-xs text-muted-foreground sm:text-sm">{t("daysShort")}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground sm:text-sm">{t("trialButtonText")}</Label>
                      <Input
                        value={value.texts[option.mode]}
                        maxLength={60}
                        onChange={(e) => set({ texts: { ...value.texts, [option.mode]: e.target.value } })}
                        className="h-10 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrialSettings;
