import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AppHeader from "@/components/layout/AppHeader";
import {
  HeaderAccountControl,
  HeaderChatsButton,
  HeaderNotificationsButton,
} from "@/components/layout/HeaderControls";
import PublicLocaleToggle from "@/components/marketplace/PublicLocaleToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { BUYER_NOTIFICATIONS_PATH } from "@/lib/navigation";
import { profileHomePath } from "@/lib/creatorAuth";
import { loginState } from "@/lib/loginModal";

type MarketplaceHeaderProps = {
  supportActive?: boolean;
  supportUnread?: number;
  onSupportClick?: () => void;
  notificationCount?: number;
  notificationsActive?: boolean;
  onNotificationsClick?: () => void;
  /** Passed to the header's sticky `below` bar (e.g. a back button). */
  below?: ReactNode;
};

const MarketplaceHeader = ({
  supportActive,
  supportUnread = 0,
  onSupportClick,
  notificationCount = 0,
  notificationsActive,
  onNotificationsClick,
  below,
}: MarketplaceHeaderProps) => {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { status, sessionToken, profileType } = useSimpleAuth();
  const signedIn = status === "authenticated" && Boolean(sessionToken && profileType);

  const defaultNotificationsClick = () => {
    if (profileType === "creator") {
      navigate("/creator?tab=notifications");
      return;
    }
    if (profileType === "buyer") {
      navigate(BUYER_NOTIFICATIONS_PATH);
    }
  };

  return (
    <AppHeader below={below}>
      {status === "loading" ? null : signedIn ? (
        <>
          <HeaderChatsButton
            active={supportActive}
            unread={supportUnread}
            onClick={onSupportClick ?? (() => navigate(profileHomePath(profileType || "buyer", localStorage.getItem("creator_account_type"))))}
          />
          <HeaderNotificationsButton
            active={notificationsActive}
            count={notificationCount}
            onClick={onNotificationsClick ?? defaultNotificationsClick}
          />
          <HeaderAccountControl />
        </>
      ) : (
        <>
          <PublicLocaleToggle />
          <Link
            to="/login"
            state={loginState(location)}
            className="inline-flex h-10 items-center rounded-full border border-[#E3E5E8] px-5 text-[15px] font-medium text-[#1F2328] transition-colors hover:bg-[#F6F7F8] focus-ring"
          >
            {t("signIn")}
          </Link>
        </>
      )}
    </AppHeader>
  );
};

export default MarketplaceHeader;
