import { useMessengerUnread } from "./useMessengerUnread";

export function useSupportUnread(_userType: "creator" | "teacher" | "student", userRef: string | null | undefined) {
  return useMessengerUnread(!!userRef).support;
}
