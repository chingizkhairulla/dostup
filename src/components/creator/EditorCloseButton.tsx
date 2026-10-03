import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/** How long the exit warning stays up before the cross goes back to warning first. */
export const EXIT_WARNING_MS = 4000;

/**
 * Two-step close for a window with unsaved changes: the first request arms a
 * warning, the second one closes. A window with nothing to lose closes at once.
 * Every way of closing (the cross, Escape) must go through `request`, so none
 * of them can skip the warning.
 */
export function useConfirmClose({
  dirty,
  onClose,
}: {
  dirty: boolean;
  onClose: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  }, []);

  const request = useCallback(() => {
    if (!dirty || armed) {
      disarm();
      onClose();
      return;
    }
    setArmed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, EXIT_WARNING_MS);
  }, [armed, dirty, disarm, onClose]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { armed, request, disarm };
}

type EditorCloseButtonProps = {
  armed: boolean;
  onClick: () => void;
};

/** The editor window's cross, with the red exit warning shown right under it. */
const EditorCloseButton = ({ armed, onClick }: EditorCloseButtonProps) => {
  const { t } = useLanguage();

  return (
    <div className="relative" data-editor-close>
      <button
        type="button"
        onClick={onClick}
        aria-label={t("close")}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
      >
        <X className="h-5 w-5" />
      </button>
      {armed ? (
        <div
          role="alert"
          className="absolute right-0 top-full z-20 mt-2 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm font-medium text-destructive shadow-md"
        >
          {t("editorExitWarning")}
        </div>
      ) : null}
    </div>
  );
};

export default EditorCloseButton;
