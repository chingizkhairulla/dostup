import { useQuery } from "@tanstack/react-query";
import { invokeApi } from "@/lib/sessionApi";

export type SupportUserType = "creator" | "teacher" | "student";

export const supportUnreadKey = (userType: SupportUserType, userRef: string) => ["support-unread", userType, userRef];

/**
 * Support replies not read yet. The support tables are closed to the browser (and so is their
 * realtime feed), so the count is asked from support-api and refreshed every few seconds.
 */
export function useSupportUnread(userType: SupportUserType, userRef: string | null | undefined) {
  const { data = 0 } = useQuery({
    queryKey: supportUnreadKey(userType, userRef ?? ""),
    queryFn: async () =>
      (await invokeApi<{ unread?: number }>("support-api", { action: "unread", user_type: userType, user_ref: userRef }, 0))
        .unread ?? 0,
    enabled: !!userRef,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  return data;
}
