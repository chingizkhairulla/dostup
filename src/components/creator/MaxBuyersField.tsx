import { ChevronDown, ChevronUp, Infinity as InfinityIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  /** Digits, "inf" for no limit, "" while not chosen. */
  value: string;
  onChange: (value: string) => void;
}

const MAX = 100000;

/**
 * "Максимальное число покупателей": a number with up/down arrows at its end and an infinity
 * button that means anyone may buy. One of the two has to be set.
 */
const MaxBuyersField = ({ id, value, onChange }: Props) => {
  const { t } = useLanguage();
  const unlimited = value === "inf";
  const current = unlimited ? 0 : Number(value) || 0;

  const step = (delta: number) => {
    const next = Math.min(MAX, Math.max(1, current + delta));
    onChange(String(next));
  };

  const arrowClass =
    "flex h-1/2 w-full items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:opacity-40";

  return (
    <div
      id={id}
      tabIndex={-1}
      className="flex h-11 max-w-xs items-center gap-1.5 rounded-xl border border-input bg-background pl-3 pr-1.5 focus-within:ring-2 focus-within:ring-ring/30"
    >
      <input
        type="text"
        inputMode="numeric"
        aria-label={t("maxBuyers")}
        value={unlimited ? "" : value}
        placeholder={unlimited ? t("noLimit") : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 6);
          onChange(digits ? String(Math.min(MAX, Number(digits))) : "");
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex h-8 w-6 shrink-0 flex-col overflow-hidden rounded-md bg-muted">
        <button type="button" className={arrowClass} onClick={() => step(1)} disabled={current >= MAX} aria-label={t("countMore")}>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={arrowClass} onClick={() => step(-1)} disabled={current <= 1} aria-label={t("countLess")}>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onChange(unlimited ? "" : "inf")}
        aria-pressed={unlimited}
        title={t("noLimit")}
        aria-label={t("noLimit")}
        className={cn(
          "flex h-8 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          unlimited ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-foreground",
        )}
      >
        <InfinityIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export default MaxBuyersField;
