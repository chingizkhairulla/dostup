import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging, isSupported } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { storedLanguage, type Language } from "@/lib/language";

const firebaseConfig = {
  apiKey: "AIzaSyBU7eLriaqnhOIDrd7O4wQmCAwqEqj-kZ4",
  authDomain: "dostup-5f5aa.firebaseapp.com",
  projectId: "dostup-5f5aa",
  storageBucket: "dostup-5f5aa.firebasestorage.app",
  messagingSenderId: "201015831480",
  appId: "1:201015831480:web:59116187a7c3375e2afd4d"
};

const VAPID_KEY = "BFPPEVA2rgBeT4WdKVfws4l1sPCFCHgXkttngeNAuVi9Br7hi7wYa1baxLQPq2l9x8PLM3SIllXN8CBWcNidmzA";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

/**
 * Initialize Firebase app and messaging
 */
export const initializeFirebaseMessaging = async (): Promise<Messaging | null> => {
  try {
    // Check if messaging is supported
    const supported = await isSupported();
    if (!supported) {
      console.log("Firebase Messaging is not supported in this browser");
      return null;
    }

    // Initialize Firebase app if not already initialized
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }

    messaging = getMessaging(app);
    return messaging;
  } catch (error) {
    console.error("Error initializing Firebase Messaging:", error);
    return null;
  }
};

/**
 * Get FCM token for push notifications
 */
export const getFCMToken = async (): Promise<string | null> => {
  try {
    // First check if notification permission is granted
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.log("Notification permission denied");
        return null;
      }
    }

    // Initialize messaging if not already done
    if (!messaging) {
      messaging = await initializeFirebaseMessaging();
      if (!messaging) return null;
    }

    // Register service worker at separate scope to avoid conflict with PWA SW
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/firebase-cloud-messaging-push-scope",
      updateViaCache: 'none'
    });

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log("FCM Token obtained:", token.substring(0, 20) + "...");
      return token;
    } else {
      console.log("No FCM token available");
      return null;
    }
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
};

type PushRole = "creator" | "student" | "teacher" | "moderator";

/**
 * The manage-push-token "register" request. `language` is stored with the
 * token, and the server writes every notification to this device in it.
 */
export const pushRegistrationBody = (
  userId: string,
  userRole: PushRole,
  fcmToken: string,
  language: Language
): Record<string, string | null | undefined> => {
  const body: Record<string, string | null | undefined> = {
    action: "register",
    userId,
    userRole,
    fcmToken,
    deviceInfo: navigator.userAgent.substring(0, 100),
    language,
  };

  // Session credentials for identity validation
  if (userRole === "creator") {
    body.creatorToken = localStorage.getItem("creator_token");
    body.creatorName = localStorage.getItem("creator_name");
  } else if (userRole === "moderator") {
    body.creatorToken = localStorage.getItem("moderator_token");
  }

  return body;
};

/**
 * Register FCM token on the server. Called again when the language changes,
 * so notifications follow the app's language.
 */
export const registerPushToken = async (
  userId: string,
  userRole: PushRole,
  language: Language = storedLanguage()
): Promise<boolean> => {
  try {
    const fcmToken = await getFCMToken();
    if (!fcmToken) {
      console.log("No FCM token to register");
      return false;
    }

    const body = pushRegistrationBody(userId, userRole, fcmToken, language);

    // Call edge function to register token
    const { data, error } = await supabase.functions.invoke("manage-push-token", {
      body
    });

    if (error) {
      console.error("Error registering push token:", error);
      return false;
    }

    console.log("Push token registered successfully:", data);
    return true;
  } catch (error) {
    console.error("Error in registerPushToken:", error);
    return false;
  }
};

/**
 * Unregister FCM token from the server (removes ALL tokens for user)
 */
export const unregisterPushToken = async (userId: string): Promise<boolean> => {
  try {
    // Remove all tokens for this user
    const body: Record<string, string | null> = {
      action: "unregister",
      userId
    };

    // For creators, include session token
    const creatorToken = localStorage.getItem("creator_token");
    const creatorName = localStorage.getItem("creator_name");
    if (creatorToken && creatorName) {
      body.userRole = "creator";
      body.creatorToken = creatorToken;
      body.creatorName = creatorName;
    }

    const { error } = await supabase.functions.invoke("manage-push-token", {
      body
    });

    if (error) {
      console.error("Error unregistering push token:", error);
      return false;
    }

    console.log("Push tokens unregistered for", userId);
    return true;
  } catch (error) {
    console.error("Error in unregisterPushToken:", error);
    return false;
  }
};

/**
 * Set up foreground message handler
 */
export const onForegroundMessage = (
  callback: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void
) => {
  if (!messaging) {
    console.log("Messaging not initialized for foreground handler");
    return () => {};
  }

  return onMessage(messaging, (payload) => {
    console.log("Foreground message received:", payload);
    callback({
      title: payload.data?.title || payload.notification?.title,
      body: payload.data?.body || payload.notification?.body,
      data: payload.data
    });
  });
};

/**
 * Send push notification via edge function
 * @param userPhone - Target user's phone/identifier
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data payload
 * @param targetRole - Optional: filter by user role ('creator' | 'student' | 'teacher')
 */
export const sendPushNotification = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  targetRole?: "creator" | "student" | "teacher"
): Promise<boolean> => {
  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: {
        userId,
        title,
        body,
        data,
        targetRole
      }
    });

    if (error) {
      console.error("Error sending push notification:", error);
      return false;
    }

    console.log("Push notification sent successfully");
    return true;
  } catch (error) {
    console.error("Error in sendPushNotification:", error);
    return false;
  }
};
