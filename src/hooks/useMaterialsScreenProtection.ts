import { useEffect, useState } from "react";
import {
  SCREEN_CAPTURE_CHANGE_EVENT,
  acquireScreenCaptureProtection,
  captureStateFromEventDetail,
  getScreenCaptureProtectionBridge,
  isScreenCaptureShortcut,
  readScreenCaptureState,
  releaseScreenCaptureProtection,
} from "@/lib/screenCaptureProtection";

export type MaterialsProtectionStatus =
  | "web-protected"
  | "web-shielded"
  | "checking"
  | "protected"
  | "captured"
  | "error"
  | "background";

interface MaterialsScreenProtectionState {
  /** Native protection is only available when a host app injects the bridge. */
  isNativeProtectionAvailable: boolean;
  status: MaterialsProtectionStatus;
  /** Protected material must not be mounted while this is true. */
  shouldHideContent: boolean;
}

const initialState = (): MaterialsScreenProtectionState => {
  const bridge = getScreenCaptureProtectionBridge();
  return bridge
    ? {
        isNativeProtectionAvailable: true,
        status: "checking",
        shouldHideContent: true,
      }
    : {
        isNativeProtectionAvailable: false,
        status:
          typeof document !== "undefined" &&
          (document.visibilityState !== "visible" || !document.hasFocus())
            ? "web-shielded"
            : "web-protected",
        shouldHideContent:
          typeof document !== "undefined" &&
          (document.visibilityState !== "visible" || !document.hasFocus()),
      };
};

/**
 * Owns OS-level screen protection for the lifetime of the Materials section.
 *
 * Native Capacitor apps use the local ScreenProtection plugin. An alternative
 * host can provide window.DostupScreenProtection. Browsers do not expose an
 * equivalent API, so the web/PWA path provides a best-effort black shield when
 * the page loses focus, becomes hidden, starts printing, or receives a known
 * screenshot shortcut. It cannot detect capture performed by another app.
 */
export const useMaterialsScreenProtection = (): MaterialsScreenProtectionState => {
  const [state, setState] = useState<MaterialsScreenProtectionState>(initialState);

  useEffect(() => {
    const bridge = getScreenCaptureProtectionBridge();
    if (!bridge) {
      let revealTimer: ReturnType<typeof window.setTimeout> | null = null;
      let shortcutTimer: ReturnType<typeof window.setTimeout> | null = null;

      const clearRevealTimer = () => {
        if (revealTimer !== null) window.clearTimeout(revealTimer);
        revealTimer = null;
      };

      const clearShortcutTimer = () => {
        if (shortcutTimer !== null) window.clearTimeout(shortcutTimer);
        shortcutTimer = null;
      };

      const hideWebContent = () => {
        clearRevealTimer();
        setState({
          isNativeProtectionAvailable: false,
          status: "web-shielded",
          shouldHideContent: true,
        });
      };

      const revealWebContent = (delay = 250) => {
        clearRevealTimer();
        if (document.visibilityState !== "visible" || !document.hasFocus()) return;

        revealTimer = window.setTimeout(() => {
          if (document.visibilityState !== "visible" || !document.hasFocus()) return;
          setState({
            isNativeProtectionAvailable: false,
            status: "web-protected",
            shouldHideContent: false,
          });
        }, delay);
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState !== "visible") {
          hideWebContent();
          return;
        }
        revealWebContent();
      };

      const handleCaptureShortcut = (event: KeyboardEvent) => {
        if (!isScreenCaptureShortcut(event)) return;
        hideWebContent();
        clearShortcutTimer();
        shortcutTimer = window.setTimeout(() => revealWebContent(0), 1500);
      };

      const handleFocus = () => revealWebContent();
      const handleAfterPrint = () => revealWebContent();

      document.documentElement.classList.add("materials-screen-protected");
      window.addEventListener("blur", hideWebContent);
      window.addEventListener("focus", handleFocus);
      window.addEventListener("keydown", handleCaptureShortcut, true);
      window.addEventListener("keyup", handleCaptureShortcut, true);
      window.addEventListener("beforeprint", hideWebContent);
      window.addEventListener("afterprint", handleAfterPrint);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        hideWebContent();
      } else {
        revealWebContent(0);
      }

      return () => {
        clearRevealTimer();
        clearShortcutTimer();
        document.documentElement.classList.remove("materials-screen-protected");
        window.removeEventListener("blur", hideWebContent);
        window.removeEventListener("focus", handleFocus);
        window.removeEventListener("keydown", handleCaptureShortcut, true);
        window.removeEventListener("keyup", handleCaptureShortcut, true);
        window.removeEventListener("beforeprint", hideWebContent);
        window.removeEventListener("afterprint", handleAfterPrint);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }

    let active = true;
    let unsubscribeFromBridge: (() => void) | null = null;

    const setChecking = () => {
      if (!active) return;
      setState({
        isNativeProtectionAvailable: true,
        status: "checking",
        shouldHideContent: true,
      });
    };

    const refreshCaptureState = async () => {
      try {
        const isCaptured = await readScreenCaptureState(bridge);
        if (!active) return;
        setState({
          isNativeProtectionAvailable: true,
          status: isCaptured ? "captured" : "protected",
          shouldHideContent: isCaptured,
        });
      } catch (error) {
        console.error("[screen-protection] Failed to read capture state", error);
        if (!active) return;
        // Fail closed in a native host: never expose paid content if protection failed.
        setState({
          isNativeProtectionAvailable: true,
          status: "error",
          shouldHideContent: true,
        });
      }
    };

    const handleCaptureChange = (event: Event) => {
      const isCaptured = captureStateFromEventDetail(
        (event as CustomEvent<unknown>).detail,
      );
      if (isCaptured === null || !active) return;

      // A late native event must not reveal content in the OS app-switcher preview.
      if (document.visibilityState !== "visible") {
        setState({
          isNativeProtectionAvailable: true,
          status: "background",
          shouldHideContent: true,
        });
        return;
      }

      setState({
        isNativeProtectionAvailable: true,
        status: isCaptured ? "captured" : "protected",
        shouldHideContent: isCaptured,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        setState({
          isNativeProtectionAvailable: true,
          status: "background",
          shouldHideContent: true,
        });
        return;
      }

      // Do not remount materials until capture state has been checked again.
      setChecking();
      void refreshCaptureState();
    };

    window.addEventListener(SCREEN_CAPTURE_CHANGE_EVENT, handleCaptureChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let protectionLeaseRequested = false;

    const initializeProtection = async () => {
      try {
        if (bridge.subscribe) {
          const unsubscribe = await bridge.subscribe((isCaptured) => {
            handleCaptureChange(
              new CustomEvent(SCREEN_CAPTURE_CHANGE_EVENT, {
                detail: { isCaptured },
              }),
            );
          });
          if (!active) {
            unsubscribe();
            return;
          }
          unsubscribeFromBridge = unsubscribe;
        }

        protectionLeaseRequested = true;
        await acquireScreenCaptureProtection(bridge);
        await refreshCaptureState();
      } catch (error) {
        console.error("[screen-protection] Failed to initialize native protection", error);
        if (!active) return;
        setState({
          isNativeProtectionAvailable: true,
          status: "error",
          shouldHideContent: true,
        });
      }
    };

    void initializeProtection();

    return () => {
      active = false;
      unsubscribeFromBridge?.();
      window.removeEventListener(SCREEN_CAPTURE_CHANGE_EVENT, handleCaptureChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (protectionLeaseRequested) {
        releaseScreenCaptureProtection(bridge).catch((error) => {
          console.error("[screen-protection] Failed to disable native protection", error);
        });
      }
    };
  }, []);

  return state;
};
