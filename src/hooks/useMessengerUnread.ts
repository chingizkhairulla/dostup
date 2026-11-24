import { useQuery } from "@tanstack/react-query";
import { invokeApi, sessionCreds } from "@/lib/sessionApi";

export function useMessengerUnread(enabled = true) {
  const profileId = localStorage.getItem("profile_id");
  const type = localStorage.getItem("profile_type");
  const query = useQuery({
    queryKey: ["messenger-unread", profileId, type],
    queryFn: () => invokeApi<{ support: number; direct: number }>("messenger-state", { ...sessionCreds(), action: "unread" }),
    enabled: enabled && !!profileId && ["buyer", "creator", "school"].includes(type ?? ""),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  return { support: query.data?.support ?? 0, total: (query.data?.support ?? 0) + (query.data?.direct ?? 0) };
}
