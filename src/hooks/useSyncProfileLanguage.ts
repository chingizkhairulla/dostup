import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { invokeApi } from "@/lib/sessionApi";

// Remembers the last session + language pair the server accepted, so a page
// load does not resend what the server already has.
const SYNCED_KEY = "profile_language_synced";

function readSynced(): string | null {
  try {
    return localStorage.getItem(SYNCED_KEY);
  } catch {
    return null;
  }
}

function writeSynced(value: string) {
  try {
    localStorage.setItem(SYNCED_KEY, value);
  } catch {
    // Without storage the language is simply sent again next time.
  }
}

/**
 * Keeps profiles.language — the language the server writes this person's
 * emails in — equal to the language they use the app in. Sent once after
 * signing in and again whenever the language is switched.
 */
export function useSyncProfileLanguage() {
  const { language } = useLanguage();
  const { status, sessionToken } = useSimpleAuth();

  useEffect(() => {
    if (status !== "authenticated" || !sessionToken) return;
    const pair = `${sessionToken}:${language}`;
    if (readSynced() === pair) return;

    invokeApi("manage-profile", { action: "set_language", token: sessionToken, language }, 0)
      .then(() => writeSynced(pair))
      .catch((error) => {
        // Best effort: until it succeeds, emails use the last language saved.
        console.warn("[i18n] could not save the profile language", error);
      });
  }, [status, sessionToken, language]);
}
