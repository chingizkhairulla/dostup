import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buyerUserFromSession,
  clearAppSession,
  isStoredSessionExpired,
  parseProfileType,
  profileHomePath,
  readAuthEmail,
  readStoredAppSession,
  readStoredProfiles,
  storeCreatorSession,
  type AppProfile,
  type ProfileType,
  type SessionPayload,
  type StoredAppSession,
} from "@/lib/creatorAuth";
import { ensureUserTimezoneDetected } from "@/lib/timezones";

export type AuthStatus = "loading" | "authenticated" | "guest";

interface SimpleUser {
  id: string;
  phone: string;
  name: string;
  role: "student" | "creator" | "teacher";
  created_at: string;
}

interface SimpleAuthContextType {
  user: SimpleUser | null;
  status: AuthStatus;
  loading: boolean;
  sessionToken: string | null;
  profileType: ProfileType | null;
  profiles: AppProfile[];
  refreshSession: () => Promise<void>;
  applySession: (session: SessionPayload, expiresAt?: string | null) => void;
  switchProfile: (opts: {
    profileId?: string;
    createType?: ProfileType;
    displayName?: string;
  }) => Promise<{ path: string } | { error: string }>;
  createProfile: (opts: {
    profileType: ProfileType;
    displayName: string;
  }) => Promise<{ path: string } | { error: string }>;
  setProfileAvatar: (url: string | null) => void;
  setProfileName: (name: string) => void;
  removeProfile: (deletedId: string, newSession: SessionPayload | null) => void;
  logout: () => Promise<void>;
}

const SimpleAuthContext = createContext<SimpleAuthContextType | undefined>(undefined);

export const useSimpleAuth = () => {
  const context = useContext(SimpleAuthContext);
  if (context === undefined) {
    throw new Error("useSimpleAuth must be used within a SimpleAuthProvider");
  }
  return context;
};

interface SimpleAuthProviderProps {
  children: ReactNode;
}

type HydratedAuthState = {
  status: AuthStatus;
  user: SimpleUser | null;
  sessionToken: string | null;
  profileType: ProfileType | null;
  profiles: AppProfile[];
};

function hydrateAuthState(): HydratedAuthState {
  if (typeof window === "undefined") {
    return {
      status: "loading",
      user: null,
      sessionToken: null,
      profileType: null,
      profiles: [],
    };
  }

  if (readAuthEmail() === "dostup.support@gmail.com" || isStoredSessionExpired()) {
    clearAppSession();
    return {
      status: "guest",
      user: null,
      sessionToken: null,
      profileType: null,
      profiles: [],
    };
  }

  const stored = readStoredAppSession();
  if (!stored) {
    return {
      status: "guest",
      user: null,
      sessionToken: null,
      profileType: null,
      profiles: [],
    };
  }

  return {
    status: "authenticated",
    sessionToken: stored.token,
    profileType: stored.profileType,
    profiles: stored.profiles,
    user: stored.profileType === "buyer" ? buyerUserFromSession(stored) : null,
  };
}

function buyerFromStorage(): SimpleUser | null {
  const stored = readStoredAppSession();
  if (!stored || stored.profileType !== "buyer") return null;
  return buyerUserFromSession(stored);
}

export const SimpleAuthProvider = ({ children }: SimpleAuthProviderProps) => {
  const initial = hydrateAuthState();
  const [status, setStatus] = useState<AuthStatus>(initial.status);
  const [user, setUser] = useState<SimpleUser | null>(initial.user);
  const [sessionToken, setSessionToken] = useState<string | null>(initial.sessionToken);
  const [profileType, setProfileType] = useState<ProfileType | null>(initial.profileType);
  const [profiles, setProfiles] = useState<AppProfile[]>(initial.profiles);
  const validating = useRef(false);

  const setGuest = useCallback(() => {
    setUser(null);
    setSessionToken(null);
    setProfileType(null);
    setProfiles([]);
    setStatus("guest");
  }, []);

  const applyBuyer = useCallback((token: string, next: SimpleUser, nextProfiles: AppProfile[]) => {
    setUser(next);
    setSessionToken(token);
    setProfileType("buyer");
    setProfiles(nextProfiles);
    setStatus("authenticated");
  }, []);

  const applyStoredSession = useCallback((stored: StoredAppSession) => {
    setSessionToken(stored.token);
    setProfileType(stored.profileType);
    setProfiles(stored.profiles);
    if (stored.profileType === "buyer") {
      applyBuyer(stored.token, buyerUserFromSession(stored), stored.profiles);
      return;
    }
    setUser(null);
    setStatus("authenticated");
  }, [applyBuyer]);

  const applySession = useCallback((session: SessionPayload, expiresAt?: string | null) => {
    storeCreatorSession({
      token: session.token,
      creatorName: session.creatorName,
      accountType: session.accountType,
      profileType: session.profileType,
      profileId: session.profileId,
      displayName: session.displayName,
      handle: session.handle,
      createdAt: session.createdAt,
      profiles: session.profiles,
      expiresAt,
    });
    const nextProfiles = session.profiles ?? [];
    ensureUserTimezoneDetected();
    setSessionToken(session.token);
    setProfileType(session.profileType);
    setProfiles(nextProfiles);
    if (session.profileType === "buyer") {
      applyBuyer(session.token, buyerUserFromSession({
        profileId: session.profileId,
        displayName: session.displayName ?? null,
        createdAt: session.createdAt ?? null,
      }), nextProfiles);
      return;
    }
    setUser(null);
    setStatus("authenticated");
  }, [applyBuyer]);

  const validateStoredSession = useCallback(async () => {
    if (readAuthEmail() === "dostup.support@gmail.com") {
      clearAppSession();
      setGuest();
      return;
    }

    const token = localStorage.getItem("creator_token");
    if (!token) {
      setGuest();
      return;
    }

    if (isStoredSessionExpired()) {
      clearAppSession();
      setGuest();
      return;
    }

    const storedType = parseProfileType(localStorage.getItem("profile_type"));
    const creatorName = localStorage.getItem("creator_name") || "";

    try {
      const { data, error } = await supabase.functions.invoke("validate-creator-session", {
        body: { token, creatorName },
      });

      if (error) {
        const cached = buyerFromStorage();
        if (cached) applyBuyer(token, cached, readStoredProfiles());
        else if (storedType) {
          setSessionToken(token);
          setProfileType(storedType);
          setStatus("authenticated");
        }
        return;
      }

      if (!data?.valid) {
        clearAppSession();
        setGuest();
        return;
      }

      if (data.needsOnboarding) {
        setSessionToken(token);
        setProfileType(null);
        setUser(null);
        setProfiles([]);
        setStatus("authenticated");
        localStorage.removeItem("profile_id");
        localStorage.removeItem("profile_type");
        return;
      }

      // If server recovered the session via JWT fallback, use the new token
      const activeToken = typeof data.newToken === "string" && data.newToken ? data.newToken : token;
      if (activeToken !== token) {
        localStorage.setItem("creator_token", activeToken);
      }

      const nextType = parseProfileType(data.profileType) || storedType;
      const nextProfiles = (data.profiles as AppProfile[] | undefined) ?? readStoredProfiles();
      setProfiles(nextProfiles);
      setProfileType(nextType);
      setSessionToken(activeToken);
      if (data.profileId) localStorage.setItem("profile_id", data.profileId);
      if (data.displayName?.trim()) {
        localStorage.setItem("profile_display_name", data.displayName.trim());
      } else if (nextType === "buyer") {
        localStorage.removeItem("profile_display_name");
      }
      if (data.profileType) localStorage.setItem("profile_type", data.profileType);
      if (typeof data.handle === "string" && data.handle) {
        localStorage.setItem("profile_handle", data.handle);
      } else if (data.handle === null || data.handle === "") {
        localStorage.removeItem("profile_handle");
      }
      if (nextProfiles.length) localStorage.setItem("identity_profiles", JSON.stringify(nextProfiles));

      if (nextType === "buyer") {
        const emailLocal = readAuthEmail().split("@")[0]?.trim() || "";
        const storedName = data.displayName?.trim() || localStorage.getItem("profile_display_name")?.trim() || "";
        applyBuyer(token, {
          id: data.profileId || localStorage.getItem("profile_id") || "",
          phone: "",
          name: storedName || emailLocal,
          role: "student",
          created_at: data.createdAt || localStorage.getItem("creator_created_at") || new Date().toISOString(),
        }, nextProfiles);
      } else {
        setUser(null);
        setStatus("authenticated");
      }
    } catch {
      const cached = buyerFromStorage();
      if (cached) applyBuyer(token, cached, readStoredProfiles());
      else if (storedType) {
        setSessionToken(token);
        setProfileType(storedType);
        setStatus("authenticated");
      }
    }
  }, [applyBuyer, setGuest]);

  const refreshSession = useCallback(async () => {
    const stored = readStoredAppSession();
    if (stored) applyStoredSession(stored);
    await validateStoredSession();
  }, [applyStoredSession, validateStoredSession]);

  useEffect(() => {
    if (validating.current) return;
    validating.current = true;
    void validateStoredSession();
  }, [validateStoredSession]);

  const createProfile = async (opts: {
    profileType: ProfileType;
    displayName: string;
  }) => {
    const token = localStorage.getItem("creator_token") || sessionToken || "";
    if (!token) return { error: "Unauthorized" };
    try {
      const { data, error } = await supabase.functions.invoke("create-profile", {
        body: {
          token,
          profileType: opts.profileType,
          displayName: opts.displayName,
        },
      });
      if (error || !data?.success || !data.token || !data.profileType) {
        let errCode = String(data?.error || "");
        if (!errCode && error && typeof error === "object" && "context" in error) {
          try {
            const ctx = (error as any).context;
            if (typeof ctx?.json === "function") {
              const errJson = await ctx.json();
              if (errJson?.error) errCode = String(errJson.error);
            }
          } catch {
            // ignore
          }
        }
        return { error: errCode || String(error?.message || "Failed") };
      }
      storeCreatorSession({
        token: data.token,
        creatorName: data.creatorName,
        accountType: data.accountType,
        profileType: data.profileType,
        profileId: data.profileId,
        displayName: data.displayName,
        handle: data.handle ?? null,
        profiles: data.profiles,
      });
      ensureUserTimezoneDetected();
      const nextType = parseProfileType(data.profileType) || "buyer";
      setProfileType(nextType);
      setProfiles((data.profiles as AppProfile[]) ?? []);
      if (nextType === "buyer") {
        applyBuyer(data.token, {
          id: data.profileId,
          phone: "",
          name: data.displayName || data.creatorName,
          role: "student",
          created_at: localStorage.getItem("creator_created_at") || new Date().toISOString(),
        }, (data.profiles as AppProfile[]) ?? []);
      } else {
        setUser(null);
        setSessionToken(data.token);
        setStatus("authenticated");
      }
      return { path: profileHomePath(data.profileType, data.accountType) };
    } catch {
      return { error: "network_failure" };
    }
  };

  const switchProfile = async (opts: {
    profileId?: string;
    createType?: ProfileType;
    displayName?: string;
  }) => {
    const token = localStorage.getItem("creator_token") || sessionToken || "";
    if (!token) return { error: "Unauthorized" };
    try {
      const { data, error } = await supabase.functions.invoke("switch-profile", {
        body: {
          token,
          profileId: opts.profileId,
          createType: opts.createType,
          displayName: opts.displayName,
        },
      });
      if (error || !data?.success || !data.token || !data.profileType) {
        let errCode = String(data?.error || "");
        if (!errCode && error && typeof error === "object" && "context" in error) {
          try {
            const ctx = (error as any).context;
            if (typeof ctx?.json === "function") {
              const errJson = await ctx.json();
              if (errJson?.error) errCode = String(errJson.error);
            }
          } catch {
            // ignore
          }
        }
        return { error: errCode || String(error?.message || "Failed") };
      }
      storeCreatorSession({
        token: data.token,
        creatorName: data.creatorName,
        accountType: data.accountType,
        profileType: data.profileType,
        profileId: data.profileId,
        displayName: data.displayName,
        handle: data.handle ?? null,
        profiles: data.profiles,
      });
      const nextType = parseProfileType(data.profileType) || "buyer";
      setProfileType(nextType);
      setProfiles((data.profiles as AppProfile[]) ?? []);
      if (nextType === "buyer") {
        applyBuyer(data.token, {
          id: data.profileId,
          phone: "",
          name: data.displayName || data.creatorName,
          role: "student",
          created_at: localStorage.getItem("creator_created_at") || new Date().toISOString(),
        }, (data.profiles as AppProfile[]) ?? []);
      } else {
        setUser(null);
        setSessionToken(data.token);
        setStatus("authenticated");
      }
      return { path: profileHomePath(data.profileType, data.accountType) };
    } catch {
      return { error: "network_failure" };
    }
  };

  const removeProfile = useCallback((deletedId: string, newSession: SessionPayload | null) => {
    // 1. Compute filtered list
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== deletedId);
      try {
        localStorage.setItem("identity_profiles", JSON.stringify(next));
      } catch { /* private mode */ }

      // 2. Apply new buyer session using the filtered list
      if (newSession) {
        storeCreatorSession({
          token: newSession.token,
          creatorName: newSession.creatorName,
          accountType: newSession.accountType,
          profileType: newSession.profileType,
          profileId: newSession.profileId,
          displayName: newSession.displayName,
          handle: newSession.handle,
          createdAt: newSession.createdAt,
        });
        // setSessionToken / setProfileType / setUser / setStatus
        // are called outside setState but batched by React 18
      }

      return next;
    });

    if (newSession) {
      setSessionToken(newSession.token);
      setProfileType(newSession.profileType);
      if (newSession.profileType === "buyer") {
        setUser(buyerUserFromSession({
          profileId: newSession.profileId,
          displayName: newSession.displayName ?? null,
          createdAt: newSession.createdAt ?? null,
        }));
      }
      setStatus("authenticated");
    }
  }, []);

  const logout = async () => {
    clearAppSession();
    setGuest();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // local sign-out is best-effort
    }
  };

  const setProfileAvatar = useCallback((url: string | null) => {
    const profileId = localStorage.getItem("profile_id");
    if (!profileId) return;
    setProfiles((prev) => {
      const next = prev.map((profile) =>
        profile.id === profileId ? { ...profile, avatarUrl: url } : profile,
      );
      try {
        localStorage.setItem("identity_profiles", JSON.stringify(next));
      } catch {
        // private mode
      }
      return next;
    });
  }, []);

  const setProfileName = useCallback((name: string) => {
    const profileId = localStorage.getItem("profile_id");
    localStorage.setItem("profile_display_name", name);
    setProfiles((prev) => {
      const next = prev.map((profile) =>
        profile.id === profileId || (!profileId && profile.isCurrent)
          ? { ...profile, displayName: name }
          : profile,
      );
      try {
        localStorage.setItem("identity_profiles", JSON.stringify(next));
      } catch {
        // private mode
      }
      return next;
    });
    setUser((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  return (
    <SimpleAuthContext.Provider value={{
      user,
      status,
      loading: status === "loading",
      sessionToken,
      profileType,
      profiles,
      refreshSession,
      applySession,
      switchProfile,
      createProfile,
      setProfileAvatar,
      setProfileName,
      removeProfile,
      logout,
    }}>
      {children}
    </SimpleAuthContext.Provider>
  );
};
