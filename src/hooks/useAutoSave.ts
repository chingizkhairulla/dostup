import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

type UseAutoSaveOptions<T> = {
  /** The latest thing that would be saved. */
  value: T;
  /** Text that changes exactly when there is something new to save. */
  saveKey: string;
  /**
   * False while nothing should be saved (the window is closed). Turning it true
   * starts a session, and the value at that moment counts as already saved.
   */
  enabled: boolean;
  /** False while the value is incomplete: nothing is saved and nothing is reported. */
  canSave?: boolean;
  save: (value: T) => Promise<void>;
  /** Quiet time after the last change before saving, in ms. */
  delay?: number;
};

/**
 * Saves as the user works instead of behind a Save button. It waits for a pause
 * in the changes, never runs two saves at once (a change made mid-save is picked
 * up by the next one), and `flush` saves whatever is pending straight away, for
 * when the window is being closed.
 */
export function useAutoSave<T>({
  value,
  saveKey,
  enabled,
  canSave = true,
  save,
  delay = 1000,
}: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");

  const latest = useRef({ value, saveKey, canSave, save });
  latest.current = { value, saveKey, canSave, save };

  // The key of the last value that is known to be saved; null outside a session.
  const savedKey = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const mounted = useRef(true);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const run = useCallback((): Promise<void> => {
    if (running.current) {
      again.current = true;
      return running.current;
    }

    // The flag is cleared from `.finally` on the promise rather than from a
    // `finally` inside the async body. The body returns synchronously when there
    // is nothing to save, and a `finally` there would clear the flag *before* it
    // is set below, leaving it stuck on and every later save silently skipped.
    const job: Promise<void> = (async () => {
      do {
        again.current = false;
        const current = latest.current;
        if (savedKey.current === null) return;
        if (!current.canSave || current.saveKey === savedKey.current) return;

        if (mounted.current) setStatus("saving");
        try {
          await current.save(current.value);
        } catch {
          if (mounted.current) setStatus("error");
          return;
        }
        // The session may have ended while saving; do not start a new one.
        if (savedKey.current !== null) savedKey.current = current.saveKey;
        if (mounted.current) setStatus("saved");
      } while (again.current);
    })().finally(() => {
      if (running.current === job) running.current = null;
    });

    running.current = job;
    return job;
  }, []);

  // Declared before the change effect so a new session's starting value is
  // recorded as saved before that effect looks at it.
  useEffect(() => {
    clearTimer();
    savedKey.current = enabled ? latest.current.saveKey : null;
    setStatus("idle");
  }, [enabled, clearTimer]);

  useEffect(() => {
    if (!enabled || savedKey.current === null) return;
    clearTimer();
    if (saveKey === savedKey.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, delay);
    return clearTimer;
  }, [saveKey, canSave, enabled, delay, run, clearTimer]);

  const flush = useCallback(async () => {
    clearTimer();
    await run();
  }, [clearTimer, run]);

  /** True when the value differs from the last saved one, whether or not it can be saved yet. */
  const hasUnsaved = useCallback(
    () => savedKey.current !== null && latest.current.saveKey !== savedKey.current,
    [],
  );

  return { status, flush, hasUnsaved };
}
