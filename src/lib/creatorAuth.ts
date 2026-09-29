import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { classifyAuthError } from "@/lib/authErrors";

export const OAUTH_ACCOUNT_TYPE_KEY = "dostup_oauth_account_type";
export const OAUTH_PROFILE_TYPE_KEY = "dostup_oauth_profile_type";
export const AUTH_EMAIL_KEY = "dostup_auth_email";
export const SELLER_DISPLAY_NAME_KEY = "dostup_seller_display_name";

export type CreatorAccountType = "course_creator" | "online_school";
export type ProfileType = "buyer" | "creator" | "school";

export type AppProfile = {
  id: string;
  type: ProfileType;
  displayName: string | null;
  createdAt?: string | null;
  avatarUrl?: string | null;
};

export type SessionPayload = {
  token: string;
  creatorName: string;
  accountType?: string | null;
  profileType: ProfileType;
  profileId: string;
  displayName?: string | null;
  createdAt?: string | null;
  handle?: string | null;
  profiles?: AppProfile[];
};

export type GoogleOAuthResult = {
  error: { message: string; code?: string; name?: string; status?: number } | null;
  path?: string;
  session?: SessionPayload;
  /** Identity has no profiles yet; an onboarding session was stored. */
  onboarding?: { token: string; creatorName: string };
};

/** Role picker shown to an identity that has no profiles yet. */
export const ONBOARDING_PATH = "/welcome";

export const CREATOR_TOKEN_EXPIRES_KEY = "creator_token_expires_at";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredAppSession = {
  token: string;
  creatorName: string;
  profileType: ProfileType;
  profileId: string;
  displayName: string | null;
  accountType: string | null;
  createdAt: string | null;
  profiles: AppProfile[];
  expiresAt: string | null;
};

export function storeCreatorSession(data: {
  token: string;
  creatorName: string;
  accountType?: string | null;
  profileType?: ProfileType | string | null;
  profileId?: string | null;
  displayName?: string | null;
  handle?: string | null;
  createdAt?: string | null;
  profiles?: AppProfile[];
  expiresAt?: string | null;
}) {
  localStorage.setItem("creator_token", data.token);
  const expiresAt = data.expiresAt || new Date(Date.now() + SESSION_TTL_MS).toISOString();
  localStorage.setItem(CREATOR_TOKEN_EXPIRES_KEY, expiresAt);
  localStorage.setItem("creator_name", data.creatorName);
  localStorage.setItem("creator_last_name", data.creatorName);
  if (data.accountType) {
    localStorage.setItem("creator_account_type", data.accountType);
  } else {
    localStorage.removeItem("creator_account_type");
  }
  const profileType = parseProfileType(data.profileType)
    || (data.accountType === "online_school" ? "school" : data.accountType ? "creator" : "buyer");
  localStorage.setItem("profile_type", profileType);
  if (data.profileId) localStorage.setItem("profile_id", data.profileId);
  if (data.displayName?.trim()) {
    localStorage.setItem("profile_display_name", data.displayName.trim());
  } else {
    localStorage.removeItem("profile_display_name");
  }
  if (data.handle) {
    localStorage.setItem("profile_handle", data.handle);
  } else if (data.handle === null) {
    localStorage.removeItem("profile_handle");
  }
  localStorage.setItem("creator_created_at", data.createdAt || new Date().toISOString());
  if (data.profiles) {
    localStorage.setItem("identity_profiles", JSON.stringify(data.profiles));
  }
}

export function clearAppSession() {
  localStorage.removeItem("creator_token");
  localStorage.removeItem(CREATOR_TOKEN_EXPIRES_KEY);
  localStorage.removeItem("creator_name");
  localStorage.removeItem("creator_last_name");
  localStorage.removeItem("creator_account_type");
  localStorage.removeItem("creator_created_at");
  localStorage.removeItem("profile_type");
  localStorage.removeItem("profile_id");
  localStorage.removeItem("profile_display_name");
  localStorage.removeItem("profile_handle");
  localStorage.removeItem("identity_profiles");
  localStorage.removeItem("simple_session_token");
  localStorage.removeItem("simple_user_id");
  localStorage.removeItem(AUTH_EMAIL_KEY);
}

export function rememberAuthEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  localStorage.setItem(AUTH_EMAIL_KEY, normalized);
}

export function rememberSellerDisplayName(name: string) {
  const trimmed = name.trim().slice(0, 100);
  if (trimmed.length < 2) return;
  try {
    sessionStorage.setItem(SELLER_DISPLAY_NAME_KEY, trimmed);
  } catch {
    // private mode
  }
}

export function readSellerDisplayName() {
  try {
    return sessionStorage.getItem(SELLER_DISPLAY_NAME_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function clearSellerDisplayName() {
  try {
    sessionStorage.removeItem(SELLER_DISPLAY_NAME_KEY);
  } catch {
    // private mode
  }
}

export function readAuthEmail() {
  return localStorage.getItem(AUTH_EMAIL_KEY)?.trim().toLowerCase() || "";
}

export function readStoredProfiles(): AppProfile[] {
  try {
    const raw = localStorage.getItem("identity_profiles");
    if (!raw) return [];
    return JSON.parse(raw) as AppProfile[];
  } catch {
    return [];
  }
}

export function isStoredSessionExpired(): boolean {
  const expiresAt = localStorage.getItem(CREATOR_TOKEN_EXPIRES_KEY);
  if (!expiresAt) return false;
  return new Date(expiresAt) <= new Date();
}

export function readStoredAppSession(): StoredAppSession | null {
  if (typeof window === "undefined") return null;
  if (readAuthEmail() === "dostup.support@gmail.com") {
    clearAppSession();
    return null;
  }
  const token = localStorage.getItem("creator_token");
  if (!token || isStoredSessionExpired()) return null;

  const profileType = parseProfileType(localStorage.getItem("profile_type"));
  if (!profileType) return null;

  const profileId = localStorage.getItem("profile_id") || "";
  return {
    token,
    creatorName: localStorage.getItem("creator_name") || "",
    profileType,
    profileId,
    displayName: localStorage.getItem("profile_display_name"),
    accountType: localStorage.getItem("creator_account_type"),
    createdAt: localStorage.getItem("creator_created_at"),
    profiles: readStoredProfiles(),
    expiresAt: localStorage.getItem(CREATOR_TOKEN_EXPIRES_KEY),
  };
}

export function buyerUserFromSession(
  session: Pick<StoredAppSession, "profileId" | "displayName" | "createdAt">,
) {
  const emailLocal = readAuthEmail().split("@")[0]?.trim() || "";
  const rawName = session.displayName?.trim() || "";
  const storedName = rawName.startsWith("buyer:") ? "" : rawName;
  return {
    id: session.profileId,
    phone: "",
    name: storedName || emailLocal || "Пользователь",
    role: "student" as const,
    created_at: session.createdAt || new Date().toISOString(),
  };
}

export function creatorHomePath(accountType: string) {
  return accountType === "online_school" ? "/school" : "/creator";
}

export function profileHomePath(profileType: string, accountType?: string | null) {
  if (profileType === "buyer") return "/";
  if (profileType === "school" || accountType === "online_school") return "/school";
  return "/creator";
}

export function isOnboardingSession(creatorName?: string | null) {
  return typeof creatorName === "string" && creatorName.startsWith("onboarding:");
}

export function storeOnboardingSession(token: string, creatorName: string) {
  localStorage.setItem("creator_token", token);
  localStorage.setItem(CREATOR_TOKEN_EXPIRES_KEY, new Date(Date.now() + SESSION_TTL_MS).toISOString());
  localStorage.setItem("creator_name", creatorName);
  localStorage.removeItem("creator_account_type");
  localStorage.removeItem("profile_type");
  localStorage.removeItem("profile_id");
  localStorage.removeItem("profile_display_name");
  localStorage.removeItem("profile_handle");
  localStorage.removeItem("identity_profiles");
}

/** Stored onboarding session (signed in, no profile chosen yet), if any. */
export function readStoredOnboardingSession(): { token: string; creatorName: string } | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("creator_token");
  const creatorName = localStorage.getItem("creator_name");
  if (!token || !isOnboardingSession(creatorName) || isStoredSessionExpired()) return null;
  return { token, creatorName: creatorName as string };
}

export const AUTH_NEXT_KEY = "dostup_auth_next";

export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

export function rememberAuthNext(path: string | null | undefined) {
  if (!isSafeInternalPath(path)) return;
  sessionStorage.setItem(AUTH_NEXT_KEY, path);
}

/** Pending post-login path, left in place for whoever consumes it. */
export function peekAuthNext() {
  const path = sessionStorage.getItem(AUTH_NEXT_KEY);
  return isSafeInternalPath(path) ? path : null;
}

/**
 * Sign-ins that started on a product or its checkout are buyers: they get a buyer profile
 * straight away instead of the role picker.
 */
export function isPurchaseIntentPath(path: string | null | undefined) {
  return typeof path === "string" && /^\/(checkout|p|product)\/[^/]+/.test(path);
}

export function consumeAuthNext() {
  const path = sessionStorage.getItem(AUTH_NEXT_KEY);
  sessionStorage.removeItem(AUTH_NEXT_KEY);
  if (!isSafeInternalPath(path)) return null;
  return path;
}

export function resolvePostAuthPath(
  email?: string,
  _profiles?: AppProfile[],
  profileType?: string | null,
  accountType?: string | null,
) {
  if (email?.trim().toLowerCase() === "dostup.support@gmail.com") {
    return "/moderator";
  }
  const next = consumeAuthNext();
  if (next) return next;
  return profileHomePath(profileType || localStorage.getItem("profile_type") || "buyer", accountType);
}

export function parseProfileType(value: string | null | undefined): ProfileType | null {
  if (value === "buyer" || value === "creator" || value === "school") return value;
  if (value === "online_school") return "school";
  if (value === "course_creator") return "creator";
  return null;
}

function parseAccountType(value: string | null | undefined): CreatorAccountType | null {
  if (value === "online_school") return "online_school";
  if (value === "course_creator" || value === "creator") return "course_creator";
  return null;
}

export function rememberOAuthAccountType(accountType?: CreatorAccountType) {
  rememberOAuthProfileType(
    accountType === "online_school" ? "school" : accountType === "course_creator" ? "creator" : undefined,
  );
}

export function rememberOAuthProfileType(profileType?: ProfileType) {
  try {
    if (profileType) {
      localStorage.setItem(OAUTH_PROFILE_TYPE_KEY, profileType);
      sessionStorage.setItem(OAUTH_PROFILE_TYPE_KEY, profileType);
      const accountType = profileType === "school" ? "online_school" : profileType === "creator" ? "course_creator" : "";
      if (accountType) {
        localStorage.setItem(OAUTH_ACCOUNT_TYPE_KEY, accountType);
        sessionStorage.setItem(OAUTH_ACCOUNT_TYPE_KEY, accountType);
      } else {
        localStorage.removeItem(OAUTH_ACCOUNT_TYPE_KEY);
        sessionStorage.removeItem(OAUTH_ACCOUNT_TYPE_KEY);
      }
    } else {
      localStorage.removeItem(OAUTH_PROFILE_TYPE_KEY);
      sessionStorage.removeItem(OAUTH_PROFILE_TYPE_KEY);
      localStorage.removeItem(OAUTH_ACCOUNT_TYPE_KEY);
      sessionStorage.removeItem(OAUTH_ACCOUNT_TYPE_KEY);
    }
  } catch {
    // private mode
  }
}

export function readOAuthAccountType(): CreatorAccountType | null {
  try {
    return parseAccountType(
      localStorage.getItem(OAUTH_ACCOUNT_TYPE_KEY) || sessionStorage.getItem(OAUTH_ACCOUNT_TYPE_KEY),
    );
  } catch {
    return null;
  }
}

export function readOAuthProfileType(): ProfileType | null {
  try {
    return parseProfileType(
      localStorage.getItem(OAUTH_PROFILE_TYPE_KEY)
        || sessionStorage.getItem(OAUTH_PROFILE_TYPE_KEY)
        || readOAuthAccountType(),
    );
  } catch {
    return null;
  }
}

export function clearOAuthAccountType() {
  rememberOAuthProfileType(undefined);
}

function authRedirectOrigin() {
  if (!import.meta.env.DEV) return window.location.origin;
  const port = window.location.port || "8080";
  return `http://localhost:${port}`;
}

export function authCallbackUrl(profileType?: ProfileType) {
  const url = new URL(`${authRedirectOrigin()}/auth/callback`);
  if (profileType && profileType !== "buyer") url.searchParams.set("profile_type", profileType);
  return url.toString();
}

type ExchangeAuthResult = {
  success?: boolean;
  token?: string;
  creatorName?: string;
  accountType?: string;
  profileType?: string;
  profileId?: string;
  displayName?: string;
  handle?: string | null;
  profiles?: { id: string; type: string; displayName: string | null }[];
  error?: string;
  needsOnboarding?: boolean;
  needsNamePrompt?: boolean;
  suggestedDisplayName?: string;
};

function sessionFromExchange(data: ExchangeAuthResult): SessionPayload | null {
  if (!data.success || typeof data.token !== "string") return null;
  const profileType = parseProfileType(data.profileType);
  if (!profileType) return null;
  return {
    token: data.token,
    creatorName: String(data.creatorName || data.displayName || ""),
    accountType: typeof data.accountType === "string" ? data.accountType : null,
    profileType,
    profileId: String(data.profileId || ""),
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    handle: data.handle ?? null,
    profiles: Array.isArray(data.profiles) ? (data.profiles as SessionPayload["profiles"]) : [],
  };
}

async function resolveExchangePayload(
  payload: ExchangeAuthResult,
): Promise<{ session: SessionPayload | null; error: string | null }> {
  if (payload.needsOnboarding && !parseProfileType(payload.profileType)) {
    return { session: null, error: String(payload.error || "exchange_failed") };
  }
  const session = sessionFromExchange(payload);
  if (!session) return { session: null, error: String(payload.error || "exchange_failed") };
  return { session, error: null };
}

export async function exchangeCreatorAccessToken(
  accessToken: string,
  email = "",
): Promise<GoogleOAuthResult> {
  let normEmail = email.trim().toLowerCase();
  if (!normEmail) {
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1] || ""));
      normEmail = String(payload.email || "").trim().toLowerCase();
    } catch {
      // ignore
    }
  }

  const isModerator = normEmail === "dostup.support@gmail.com";

  if (isModerator) {
    clearAppSession();
    try {
      const { data: modToken } = await supabase.rpc("claim_moderator_session");
      if (modToken && typeof modToken === "string") {
        localStorage.setItem("moderator_token", modToken);
      }
    } catch (e) {
      console.error("claim_moderator_session error:", e);
    }
    return { error: null, session: null, path: "/moderator" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("exchange-auth-session", {
      body: {
        access_token: accessToken,
      },
    });

    const result = (data ?? {}) as ExchangeAuthResult;
    const errCode = result.error || error?.message;

    if (error && !result.success && !result.needsOnboarding) {
      if (isModerator) {
        if (normEmail) rememberAuthEmail(normEmail);
        return { error: null, session: null, path: "/moderator" };
      }
      const code = errCode === "account_type_required" ? "account_type_required" : "exchange_failed";
      return { error: { message: code, code } };
    }

    if (result.success && result.needsOnboarding && typeof result.token === "string" && result.token) {
      const creatorName = String(result.creatorName || "");
      storeOnboardingSession(result.token, creatorName);
      if (normEmail) rememberAuthEmail(normEmail);
      clearOAuthAccountType();
      // Keep any pending "next" path; it is used after the first profile is created.
      return {
        error: null,
        onboarding: { token: result.token, creatorName },
        path: ONBOARDING_PATH,
      };
    }

    const resolved = await resolveExchangePayload(result);
    if (!resolved.session) {
      if (isModerator) {
        if (normEmail) rememberAuthEmail(normEmail);
        return { error: null, session: null, path: "/moderator" };
      }
      const code = resolved.error === "account_type_required" ? "account_type_required" : "exchange_failed";
      return { error: { message: code, code } };
    }

    storeCreatorSession(resolved.session);
    if (normEmail) rememberAuthEmail(normEmail);
    clearOAuthAccountType();

    return {
      error: null,
      session: resolved.session,
      path: isModerator
        ? "/moderator"
        : resolvePostAuthPath(
            normEmail,
            resolved.session.profiles ?? [],
            resolved.session.profileType,
            resolved.session.accountType,
          ),
    };
  } catch (err) {
    if (isModerator) {
      if (normEmail) rememberAuthEmail(normEmail);
      return { error: null, session: null, path: "/moderator" };
    }
    const message = err instanceof Error ? err.message : "network_failure";
    return { error: { message, code: "network_failure" } };
  }
}

export async function exchangeCreatorSession(session: Session): Promise<GoogleOAuthResult> {
  const email = session.user.email?.trim().toLowerCase() || "";
  return exchangeCreatorAccessToken(session.access_token, email);
}

/** @deprecated Use exchangeCreatorSession */
export async function completeGoogleOAuthSession(session: Session): Promise<GoogleOAuthResult> {
  return exchangeCreatorSession(session);
}

export async function startGoogleOAuth(profileType?: ProfileType): Promise<GoogleOAuthResult> {
  rememberOAuthProfileType(profileType);
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      return {
        error: {
          message: error.message,
          code: error.code,
          name: error.name,
          status: error.status,
        },
      };
    }
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "network_failure";
    return {
      error: {
        message,
        code: classifyAuthError({ message, name: err instanceof Error ? err.name : undefined }),
        name: err instanceof Error ? err.name : undefined,
      },
    };
  }
}

const EMAIL_OTP_TYPES = ["email", "magiclink", "signup"] as const;

export async function sendEmailCode(email: string, profileType?: ProfileType) {
  rememberOAuthProfileType(profileType);
  const address = email.trim().toLowerCase();
  try {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // leftover Supabase session must not block a new code
    }
    const { data, error } = await supabase.functions.invoke("send-email-code", {
      body: { email: address },
    });
    if (error || (data && typeof data === "object" && "error" in data && data.error)) {
      const message =
        (data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : error?.message) || "network_failure";
      return {
        data: { user: null, session: null },
        error: {
          message,
          code: classifyAuthError({ message, status: error?.status }),
          name: error?.name,
          status: error?.status,
        },
      };
    }
    return { data: { user: null, session: null }, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "network_failure";
    return {
      data: { user: null, session: null },
      error: {
        message,
        code: classifyAuthError({ message, name: err instanceof Error ? err.name : undefined }),
        name: err instanceof Error ? err.name : "AuthRetryableFetchError",
      },
    };
  }
}

export async function verifyEmailCode(email: string, token: string) {
  const address = email.trim().toLowerCase();
  let firstError: Awaited<ReturnType<typeof supabase.auth.verifyOtp>> | null = null;
  let last = firstError;
  for (const type of EMAIL_OTP_TYPES) {
    const result = await supabase.auth.verifyOtp({
      email: address,
      token,
      type,
    });
    if (!result.error && result.data.session) return result;
    if (!firstError && result.error) firstError = result;
    last = result;
  }
  return firstError ?? last!;
}

export async function exchangeAuthSession(accessToken: string) {
  return supabase.functions.invoke("exchange-auth-session", {
    body: {
      access_token: accessToken,
    },
  });
}

export async function completeExchangedSession(
  payload: Record<string, unknown> | null,
) {
  return resolveExchangePayload((payload ?? {}) as ExchangeAuthResult);
}

export function sendCreatorMagicLink(email: string, accountType?: CreatorAccountType) {
  return sendEmailCode(
    email,
    accountType === "online_school" ? "school" : accountType === "course_creator" ? "creator" : undefined,
  );
}
