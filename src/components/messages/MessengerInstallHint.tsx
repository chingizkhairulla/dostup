import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { Link } from "react-router-dom";
import { invokeApi, sessionCreds } from "@/lib/sessionApi";
import { isAppInstalled } from "@/lib/installPrompt";

export default function MessengerInstallHint() {
  const profileId = localStorage.getItem("profile_id");
  const type = localStorage.getItem("profile_type");
  if (!profileId || !["buyer", "creator", "school"].includes(type ?? "")) return null;
  return <ProfileInstallHint key={profileId} profileId={profileId} />;
}

function ProfileInstallHint({ profileId }: { profileId: string }) {
  const key = `messenger-install-hint:${profileId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === "seen");
  const { data } = useQuery({
    queryKey: ["messenger-install-hint", profileId],
    queryFn: () => invokeApi<{ show: boolean }>("messenger-state", { ...sessionCreds(), action: "claim_install_hint" }),
    enabled: !dismissed,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (data) localStorage.setItem(key, "seen");
  }, [data, key]);
  if (!data?.show || dismissed || isAppInstalled()) return null;
  return <div className="mb-3 flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-sm leading-snug">
    <Link to="/install" className="flex min-w-0 flex-1 items-start gap-2 text-foreground hover:text-primary">
      <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>Скачайте приложение, чтобы получать уведомления!</span>
    </Link>
    <button type="button" aria-label="Закрыть подсказку" onClick={() => setDismissed(true)} className="rounded p-0.5 text-muted-foreground hover:bg-primary/10"><X className="h-4 w-4" /></button>
  </div>;
}
