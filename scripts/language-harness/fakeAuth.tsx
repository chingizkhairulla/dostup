import type { ReactNode } from "react";

// Stands in for src/contexts/SimpleAuthContext.tsx: a signed-in seller, with no
// session to restore and no server to ask.

export type AuthStatus = "loading" | "authenticated" | "guest";

const noop = async () => {};

const seller = {
  status: "authenticated" as AuthStatus,
  sessionToken: "harness-token",
  profileType: "creator",
  user: { id: "user-1", name: "Demo Seller", phone: "", role: "student", created_at: "2026-01-15T10:00:00Z" },
  profiles: [
    { id: "profile-1", type: "creator", displayName: "Demo Seller", handle: "demo-seller", avatarUrl: null, isCurrent: true },
    { id: "profile-2", type: "buyer", displayName: "Demo Buyer", handle: null, avatarUrl: null, isCurrent: false },
  ],
  switchProfile: noop,
  refreshProfiles: noop,
  refresh: noop,
  login: noop,
  logout: noop,
  signOut: noop,
};

export const useSimpleAuth = () => seller;

export const SimpleAuthProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
