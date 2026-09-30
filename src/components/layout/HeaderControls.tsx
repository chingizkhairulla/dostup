import { useState } from "react";
import { Bell, LogOut, MessageCircle, Settings, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AccountSheet from "@/components/layout/BuyerAccountSheet";
import AccountSettingsDialog from "@/components/account/AccountSettingsDialog";
import {
  initialsFrom,
  profileDisplayLabel,
  profilesInSidebarOrder,
  useProfileAccountActions,
} from "@/components/layout/ProfileAccountRows";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const HEADER_ICON_CLASS = "h-6 w-6 shrink-0";

export function headerIconButtonClass(active?: boolean) {
  return cn(
    "relative flex items-center justify-center transition-colors select-none",
    "h-10 w-10 shrink-0 rounded-full",
    "md:h-auto md:w-auto md:min-w-[48px] md:flex-col md:gap-0.5 md:rounded-xl md:px-1.5 md:py-1",
    active
      ? "bg-primary/15 text-primary md:bg-primary/10"
      : "text-muted-foreground hover:bg-muted hover:text-foreground md:hover:bg-muted/60",
  );
}

type HeaderChatsButtonProps = {
  active?: boolean;
  unread?: number;
  onClick: () => void;
};

export function HeaderChatsButton({ active, unread = 0, onClick }: HeaderChatsButtonProps) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("headerChats")}
      title={t("headerChats")}
      className={headerIconButtonClass(active)}
    >
      <div className="relative flex items-center justify-center">
        <MessageCircle className={HEADER_ICON_CLASS} strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 md:-right-2 md:-top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>
      <span className="hidden md:block text-[11px] font-medium leading-tight">
        {t("headerChats")}
      </span>
    </button>
  );
}

type HeaderNotificationsButtonProps = {
  active?: boolean;
  count?: number;
  onClick: () => void;
};

export function HeaderNotificationsButton({ active, count = 0, onClick }: HeaderNotificationsButtonProps) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("notifications")}
      title={t("notifications")}
      className={headerIconButtonClass(active)}
    >
      <div className="relative flex items-center justify-center">
        <Bell className={HEADER_ICON_CLASS} strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 md:-right-2 md:-top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </div>
      <span className="hidden md:block text-[11px] font-medium leading-tight">
        {t("notifications")}
      </span>
    </button>
  );
}

function accountHrefForProfileType(profileType: string | null | undefined) {
  if (profileType === "creator") return "/creator?tab=account";
  if (profileType === "school") return "/school";
  if (profileType === "buyer") return "/dashboard/account";
  return null;
}

export function ActiveProfileAvatar({ className }: { className?: string }) {
  const { profiles, user } = useSimpleAuth();
  const activeProfileId = typeof window !== "undefined" ? localStorage.getItem("profile_id") || "" : "";
  const storedName = typeof window !== "undefined" ? localStorage.getItem("profile_display_name") || localStorage.getItem("creator_name") || "" : "";
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profilesInSidebarOrder(profiles)[0];
  const displayName = (activeProfile ? profileDisplayLabel(activeProfile) : "") || user?.name || storedName || "П";
  const avatarUrl = activeProfile?.avatarUrl || null;

  return (
    <div
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden border border-border/80 bg-muted text-foreground font-semibold text-xs select-none shadow-xs",
        className,
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initialsFrom(displayName)}</span>
      )}
    </div>
  );
}

/** Header settings button — opens account settings modal directly on both desktop and mobile. */
export function HeaderAccountControl({ mobileNav }: { mobileNav?: React.ReactNode } = {}) {
  const { t } = useLanguage();
  const { user, profileType, profiles } = useSimpleAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeProfileId = typeof window !== "undefined" ? localStorage.getItem("profile_id") : null;
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("simple_user_id") || "" : "";
  const creatorName = typeof window !== "undefined" ? localStorage.getItem("creator_name") : null;
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const shownName = activeProfile?.displayName?.trim() || user?.name || creatorName || "—";
  const effectiveUserId = user?.id || currentUserId || creatorName || "";
  const createdAt = user?.created_at || (typeof window !== "undefined" ? localStorage.getItem("creator_created_at") : null);

  return (
    <>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label={t("accountSettings")}
        title={t("accountSettings")}
        className={headerIconButtonClass(settingsOpen)}
      >
        <div className="relative flex items-center justify-center">
          <Settings className={HEADER_ICON_CLASS} strokeWidth={1.75} />
        </div>
        <span className="hidden md:block text-[11px] font-medium leading-tight">
          {t("accountSettings")}
        </span>
      </button>
      <AccountSettingsDialog
        mobileNav={mobileNav}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        role={profileType || "buyer"}
        displayName={shownName}
        userId={effectiveUserId}
        createdAt={createdAt}
      />
    </>
  );
}

type TeacherHeaderAccountProps = {
  displayName: string;
  onAccount: () => void;
  onSignOut: () => void;
};

/** Teacher sessions use a separate auth path — avatar menu without profile switching. */
export function TeacherHeaderAccount({ displayName, onAccount, onSignOut }: TeacherHeaderAccountProps) {
  const { t } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("account")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent/50"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {initialsFrom(displayName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onAccount}>
          <UserRound className="mr-2 h-4 w-4" />
          {t("account")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
