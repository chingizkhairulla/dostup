import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export const SCREEN_CAPTURE_CHANGE_EVENT = "dostup:screen-capture-change";

interface CapacitorScreenProtectionPlugin {
  setProtected(options: { enabled: boolean }): Promise<void>;
  isCaptured(): Promise<{ isCaptured: boolean }>;
  addListener(
    eventName: "screenCaptureChanged",
    listener: (event: { isCaptured: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeScreenProtection = registerPlugin<CapacitorScreenProtectionPlugin>(
  "ScreenProtection",
);

export interface ScreenCaptureProtectionBridge {
  /**
   * Enables or disables OS-level screen protection for the current native view.
   * Android implementations must toggle FLAG_SECURE here.
   */
  setProtected(enabled: boolean): void | Promise<void>;

  /**
   * Returns whether the OS is currently capturing the screen.
   * iOS implementations should return UIScreen.main.isCaptured.
   */
  isCaptured?(): boolean | Promise<boolean>;

  /** Subscribes to native recording-state changes. */
  subscribe?(listener: (isCaptured: boolean) => void):
    | (() => void)
    | Promise<() => void>;
}

let activeProtectionRequests = 0;
let protectionTransition: Promise<void> = Promise.resolve();

declare global {
  interface Window {
    DostupScreenProtection?: ScreenCaptureProtectionBridge;
  }
}

export const isScreenCaptureProtectionBridge = (
  value: unknown,
): value is ScreenCaptureProtectionBridge => {
  if (!value || typeof value !== "object") return false;
  return typeof (value as ScreenCaptureProtectionBridge).setProtected === "function";
};

/**
 * The bridge is intentionally absent in a regular browser/PWA: the Web platform
 * cannot reliably detect or prevent OS screenshots and screen recording.
 */
export const getScreenCaptureProtectionBridge = (): ScreenCaptureProtectionBridge | null => {
  if (typeof window === "undefined") return null;
  if (isScreenCaptureProtectionBridge(window.DostupScreenProtection)) {
    return window.DostupScreenProtection;
  }

  if (
    !Capacitor.isNativePlatform() ||
    !Capacitor.isPluginAvailable("ScreenProtection")
  ) {
    return null;
  }

  return {
    setProtected: async (enabled) => {
      await NativeScreenProtection.setProtected({ enabled });
    },
    isCaptured: async () => {
      const result = await NativeScreenProtection.isCaptured();
      return result.isCaptured;
    },
    subscribe: async (listener) => {
      const handle = await NativeScreenProtection.addListener(
        "screenCaptureChanged",
        ({ isCaptured }) => listener(isCaptured),
      );
      return () => {
        void handle.remove();
      };
    },
  };
};

export const captureStateFromEventDetail = (detail: unknown): boolean | null => {
  if (typeof detail === "boolean") return detail;
  if (!detail || typeof detail !== "object") return null;

  const isCaptured = (detail as { isCaptured?: unknown }).isCaptured;
  return typeof isCaptured === "boolean" ? isCaptured : null;
};

export const readScreenCaptureState = async (
  bridge: ScreenCaptureProtectionBridge,
): Promise<boolean> => {
  if (!bridge.isCaptured) return false;
  const isCaptured = await bridge.isCaptured();
  if (typeof isCaptured !== "boolean") {
    throw new TypeError("Native screen-protection bridge returned a non-boolean capture state");
  }
  return isCaptured;
};

/**
 * Serializes bridge mutations so quick route changes cannot leave FLAG_SECURE
 * in the wrong state. Multiple mounted consumers share one protection lease.
 */
export const acquireScreenCaptureProtection = (
  bridge: ScreenCaptureProtectionBridge,
): Promise<void> => {
  activeProtectionRequests += 1;
  protectionTransition = protectionTransition
    .catch(() => undefined)
    .then(async () => {
      if (activeProtectionRequests > 0) await bridge.setProtected(true);
    });
  return protectionTransition;
};

export const releaseScreenCaptureProtection = (
  bridge: ScreenCaptureProtectionBridge,
): Promise<void> => {
  activeProtectionRequests = Math.max(0, activeProtectionRequests - 1);
  protectionTransition = protectionTransition
    .catch(() => undefined)
    .then(async () => {
      if (activeProtectionRequests === 0) await bridge.setProtected(false);
    });
  return protectionTransition;
};
