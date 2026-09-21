import { useState, useEffect } from "react";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import AccountSettingsView from "@/components/account/AccountSettingsView";
import { invokeApi } from "@/lib/sessionApi";

interface CreatorAccountTabProps {
  creatorName: string;
}

const CreatorAccountTab = ({ creatorName }: CreatorAccountTabProps) => {
  const { profiles } = useSimpleAuth();
  const [createdAt, setCreatedAt] = useState<Date | null>(null);

  const activeProfileId = typeof window !== "undefined" ? localStorage.getItem("profile_id") : null;
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("simple_user_id") || "" : "";
  const shownName =
    profiles.find((profile) => profile.id === activeProfileId)?.displayName?.trim() ||
    creatorName;

  useEffect(() => {
    let active = true;
    invokeApi<{ createdAt?: string | null }>("manage-profile", {
      action: "get_handle",
      token: localStorage.getItem("creator_token") || "",
    })
      .then((data) => {
        if (active && data.createdAt) setCreatedAt(new Date(data.createdAt));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <AccountSettingsView
      role="creator"
      displayName={shownName}
      createdAt={createdAt}
      userId={currentUserId || creatorName}
    />
  );
};

export default CreatorAccountTab;
