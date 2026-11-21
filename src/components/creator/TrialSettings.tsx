import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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

const OPTIONS: { mode: TrialMode; title: string; description: string }[] = [
  {
    mode: "lesson",
    title: "Урок / Консультация",
    description:
      "Люди могут оплатить только после пробного урока и с вашего разрешения. Подходит для преподавателей с ограниченным набором учеников",
  },
  {
    mode: "period",
    title: "Период времени",
    description:
      "Люди могут оплатить во время и после пробного, без вашего ведома. Подходит для продажи курсов без ограниченного набора и индивидуальных уроков",
  },
];

const DAY_PRESETS = [3, 7, 30];

/**
 * "Бесплатный пробный" under the payment options: one trial for the whole product, applied to
 * every payment option. "Lesson" makes buying possible only with the seller's permission,
 * "Period" leaves buying free.
 */
const TrialSettings = ({ value, onChange }: { value: TrialValue; onChange: (next: TrialValue) => void }) => {
  const set = (patch: Partial<TrialValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4" id="field-trial">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-sm font-medium sm:text-base">Бесплатный пробный</span>
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
                    <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                    <span className="block text-xs text-muted-foreground sm:text-sm">{option.description}</span>
                  </span>
                </button>

                {selected && (
                  <div className="mt-3 space-y-3 pl-7">
                    {option.mode === "period" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground sm:text-sm">Длительность</Label>
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
                              {days} {days === 3 ? "дня" : "дней"}
                            </Button>
                          ))}
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              aria-label="Число дней"
                              value={value.days || ""}
                              onChange={(e) => set({ days: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                              className="h-9 w-20 text-sm"
                            />
                            <span className="text-xs text-muted-foreground sm:text-sm">дн.</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground sm:text-sm">Текст кнопки на витрине</Label>
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
