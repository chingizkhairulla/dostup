import { useEffect, useState } from "react";
import {
  SCREEN_CAPTURE_CHANGE_EVENT,
  acquireScreenCaptureProtection,
  captureStateFromEventDetail,
  getScreenCaptureProtectionBridge,
  readScreenCaptureState,
  releaseScreenCaptureProtection,
} from "@/lib/screenCaptureProtection";

export type MaterialsProtectionStatus =
  | "web-unavailable"
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
        status: "web-unavailable",
        shouldHideContent: false,
      };
};

/**
 * Owns OS-level screen protection for the lifetime of the Materials section.
 *
 * Native Capacitor apps use the local ScreenProtection plugin. An alternative
 * host can provide window.DostupScreenProtection. Browsers do not expose an
 * equivalent API, so the web/PWA path remains explicitly unsupported instead
 * of pretending to block screenshots with JavaScript.
 */
export const useMaterialsScreenProtection = (): MaterialsScreenProtectionState => {
  const [state, setState] = useState<MaterialsScreenProtectionState>(initialState);

  useEffect(() => {
    const bridge = getScreenCaptureProtectionBridge();
    if (!bridge) return;

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
