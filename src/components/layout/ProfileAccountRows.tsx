import type { ReactElement } from "react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, LogOut, Plus, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { cn } from "@/lib/utils";
import { type AppProfile, readAuthEmail, type ProfileType } from "@/lib/creatorAuth";
import { initialsFrom } from "@/lib/displayName";
import { profilesInSidebarOrder } from "@/lib/profileOrder";
import { invalidateAvatarQueries, uploadProfileAvatar } from "@/lib/avatarUpload";
import AddSellerProfileDialog from "@/components/layout/AddSellerProfileDialog";
import { toast } from "sonner";

export { initialsFrom };
export { profilesInSidebarOrder, profilesInCreationOrder } from "@/lib/profileOrder";

export function profileRoleLabel(
  profile: AppProfile,
  t: (key: string) => string,
) {
  if (profile.type === "buyer") return t("profileBuyer");
  if (profile.type === "school") return t("profileSchool");
  return t("profileCreator");
}

export function profileDisplayLabel(profile: AppProfile) {
  const name = profile.displayName?.trim();
  if (name) return name;
  if (profile.type === "buyer") {
    const local = readAuthEmail().split("@")[0]?.trim();
    if (local) return local;
  }
  return "—";
}

type ProfileAccountRowsProps = {
  expanded: boolean;
  activeProfileId: string;
  profiles: AppProfile[];
  busyProfileId: string | null;
  creatingType: ProfileType | null;
  onSwitch: (profile: AppProfile) => void;
  onCreateSeller: (
    type: ProfileType,
    displayName: string,
    avatarFile?: File | null,
  ) => void | Promise<boolean | { ok: boolean; error?: string } | void> | boolean | { ok: boolean; error?: string };
  onSignOut?: () => void;
  showSignOut?: boolean;
  accountHref?: string | null;
  onToggleExpanded?: () => void;
  showAccountActions?: boolean;
};

function CollapsedTip({
  expanded,
  label,
  children,
}: {
  expanded: boolean;
  label: string;
  children: ReactElement;
}) {
  if (expanded) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ProfileAccountRows({
  expanded,
  activeProfileId,
  profiles,
  busyProfileId,
  creatingType,
  onSwitch,
  onCreateSeller,
  onSignOut,
  showSignOut = false,
  accountHref,
  onToggleExpanded,
  showAccountActions = false,
}: ProfileAccountRowsProps) {
  const { t } = useLanguage();
  const [wizardOpen, setWizardOpen] = useState(false);
  const orderedProfiles = profilesInSidebarOrder(profiles);
  const showBottomGroup = Boolean(
    onToggleExpanded || (showAccountActions && (accountHref || (showSignOut && onSignOut))),
  );
  const newProfileButton = (
    <button
      type="button"
      title={t("addSellerProfile")}
      onClick={() => setWizardOpen(true)}
      disabled={!!creatingType}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-60",
        !expanded && "justify-center px-0",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border/80">
        {creatingType ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        )}
      </span>
      {expanded && <span className="truncate text-[15px]">{t("addSellerProfile")}</span>}
    </button>
  );

  const newProfileControl = expanded ? (
    newProfileButton
  ) : (
    <CollapsedTip expanded={expanded} label={t("addSellerProfile")}>
      {newProfileButton}
    </CollapsedTip>
  );

  const profileRow = (profile: AppProfile) => {
    const active = profile.id === activeProfileId;
    const busy = busyProfileId === profile.id;
    const displayName = profileDisplayLabel(profile);
    const role = profileRoleLabel(profile, t);

    const button = (
      <button
        key={profile.id}
        type="button"
        disabled={busyProfileId !== null && !busy}
        onClick={() => onSwitch(profile)}
        className={cn(
          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
          active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          !expanded && "justify-center px-0",
        )}
      >
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#FF6B00]" aria-hidden />
        )}
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden border border-border/80 bg-muted text-foreground font-semibold text-xs select-none">
          {profile.avatarUrl && !busy ? (
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span>{initialsFrom(displayName)}</span>
          )}
        </div>
        {expanded && (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[15px] font-medium leading-tight">{displayName}</p>
            <p className="truncate text-[12px] leading-tight text-[#6B7280]">{role}</p>
          </div>
        )}
        {expanded && active && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6B00]" aria-hidden />
        )}
      </button>
    );

    if (!expanded) {
      return (
        <Tooltip key={profile.id}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" className="text-left">
            <p className="font-medium">{displayName}</p>
            <p className="text-xs text-[#6B7280]">{role}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  const bottomRowClass = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
    !expanded && "justify-center px-0",
  );

  return (
    <div className="flex shrink-0 flex-col">
      <AddSellerProfileDialog
        open={wizardOpen}
        creating={!!creatingType}
        onOpenChange={(open) => {
          if (!open && !creatingType) setWizardOpen(false);
        }}
        onConfirm={async (type, displayName, avatarFile) => {
          const res = await onCreateSeller(type, displayName, avatarFile);
          if (res === true || (typeof res === "object" && res?.ok === true)) {
            setWizardOpen(false);
          }
          return res;
        }}
      />
      {expanded && (
        <div className="px-2.5 pb-1.5 pt-1 text-sm font-semibold text-foreground">
          {t("navProfiles") || "Профили"}
        </div>
      )}
      {newProfileControl}
      <div className="flex max-h-[40vh] flex-col overflow-y-auto">
        {orderedProfiles.map((profile) => profileRow(profile))}
      </div>

      {showBottomGroup && (
        <>
          <div className="mx-2 my-2 border-t border-border" />
          <div className="flex shrink-0 flex-col pb-2">
            {showAccountActions && accountHref && (
              <CollapsedTip expanded={expanded} label={t("account")}>
                <Link to={accountHref} title={t("account")} className={bottomRowClass}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <UserRound className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  {expanded && <span className="text-[15px]">{t("account")}</span>}
                </Link>
              </CollapsedTip>
            )}
            {showAccountActions && showSignOut && onSignOut && (
              <CollapsedTip expanded={expanded} label={t("signOut")}>
                <button
                  type="button"
                  onClick={onSignOut}
                  title={t("signOut")}
                  className={bottomRowClass}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <LogOut className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  {expanded && <span className="text-[15px]">{t("signOut")}</span>}
                </button>
              </CollapsedTip>
            )}
            {onToggleExpanded && (
              <CollapsedTip expanded={expanded} label={expanded ? t("collapseNav") : t("expandNav")}>
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  aria-label={expanded ? t("collapseNav") : t("expandNav")}
                  className={bottomRowClass}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {expanded ? (
                      <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                    ) : (
                      <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </span>
                  {expanded && (
                    <span className="text-[15px]">{t("collapseNav")}</span>
                  )}
                </button>
              </CollapsedTip>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function useProfileAccountActions() {
  const { t } = useLanguage();
  const { profiles, switchProfile, logout, setProfileAvatar } = useSimpleAuth();
  const queryClient = useQueryClient();

  const runSwitch = async (
    profile: AppProfile,
    navigate: (path: string) => void,
    onDone?: () => void,
  ) => {
    const activeProfileId = localStorage.getItem("profile_id") || "";
    if (profile.id === activeProfileId) {
      onDone?.();
      return;
    }
    const result = await switchProfile({ profileId: profile.id });
    if ("error" in result) {
      toast.error(t("switchProfileError"));
    } else {
      navigate(result.path);
    }
    onDone?.();
  };

  const createSeller = async (
    type: ProfileType,
    displayName: string,
    navigate: (path: string) => void,
    onDone?: () => void,
    avatarFile?: File | null,
  ) => {
    const result = await switchProfile({ createType: type, displayName });
    if ("error" in result) {
      const isNameTaken = result.error === "name_taken" || result.error?.includes("name_taken");
      const errText = isNameTaken
        ? "Это название уже используется. Выберите другое."
        : t("switchProfileError");
      toast.error(errText);
      onDone?.();
      return { ok: false, error: errText };
    }
    if (avatarFile) {
      try {
        const url = await uploadProfileAvatar(avatarFile);
        setProfileAvatar(url);
        invalidateAvatarQueries(queryClient);
      } catch {
        toast.error(t("avatarSaveError"));
      }
    }
    navigate(result.path);
    onDone?.();
    return { ok: true };
  };

  return { profiles, runSwitch, createSeller, logout };
}
