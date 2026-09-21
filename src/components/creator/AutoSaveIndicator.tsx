import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { AutoSaveStatus } from "@/hooks/useAutoSave";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Icon-only, on purpose: the design asks for as few words as possible. The text
 * is still there for screen readers and as a tooltip.
 */
const AutoSaveIndicator = ({ status }: { status: AutoSaveStatus }) => {
  const { t } = useLanguage();
  if (status === "idle") return null;

  const label = {
    saving: t("autosaveSaving"),
    saved: t("autosaveSaved"),
    error: t("autosaveError"),
  }[status];

  return (
    <span role="status" aria-label={label} title={label} className="inline-flex items-center">
      {status === "saving" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {status === "saved" && <Check className="h-4 w-4 text-muted-foreground" />}
      {status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
    </span>
  );
};

export default AutoSaveIndicator;
