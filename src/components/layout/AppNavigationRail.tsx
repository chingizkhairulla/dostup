import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { cn } from "@/lib/utils";
import { type ProfileType } from "@/lib/creatorAuth";
import {
  BUYER_NAV_ITEMS,
  buyerSectionFromPath,
  creatorTabFromPath,
  SELLER_NAV_ITEMS,
  type BuyerSectionKey,
  type RailSectionKey,
  type SellerSectionKey,
} from "@/lib/navigation";
import {
  ProfileAccountRows,
  useProfileAccountActions,
} from "@/components/layout/ProfileAccountRows";
import { useCreatorPendingPurchases } from "@/components/creator/CreatorPendingPayments";

const RAIL_COLLAPSED = 64;
const RAIL_EXPANDED = 240;
const RAIL_STORAGE_KEY = "dostup_nav_rail_expanded";
const RAIL_CHANGE_EVENT = "dostup-nav-rail";

type AppNavigationRailProps = {
  activeSection?: RailSectionKey;
  /** When on /creator, overrides URL-derived seller tab for highlight state. */
  sellerTab?: SellerSectionKey;
};

const AppNavigationRail = ({ activeSection, sellerTab }: AppNavigationRailProps) => {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { profileType } = useSimpleAuth();
  const { profiles, runSwitch, createSeller } = useProfileAccountActions();
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(RAIL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<ProfileType | null>(null);

  const width = expanded ? RAIL_EXPANDED : RAIL_COLLAPSED;
  const isSellerProfile = profileType === "creator" || profileType === "school";

  const buyerSection: BuyerSectionKey | null =
    activeSection && BUYER_NAV_ITEMS.some((item) => item.key === activeSection)
      ? (activeSection as BuyerSectionKey)
      : buyerSectionFromPath(location.pathname);

  const resolvedSellerTab =
    sellerTab ?? (isSellerProfile ? creatorTabFromPath(location.pathname, location.search) : "products");

  const activeProfileId = localStorage.getItem("profile_id") || "";

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // private mode
      }
      window.dispatchEvent(new Event(RAIL_CHANGE_EVENT));
      return next;
    });
  };

  const creatorName = localStorage.getItem("creator_name");
  const { data: pendingPurchases = [] } = useCreatorPendingPurchases(isSellerProfile ? creatorName : null);
  const pendingCount = pendingPurchases.length;

  const sectionLink = (
    key: RailSectionKey,
    to: string,
    Icon: typeof Search,
    label: string,
    active: boolean,
    badgeCount?: number,
  ) => (
    <Link
      key={key}
      to={to}
      title={label}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[15px] font-medium transition-colors",
        active ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        !expanded && "justify-center px-0",
      )}
    >
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#FF6B00]" aria-hidden />
      )}
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <Icon className="h-6 w-6 shrink-0" strokeWidth={1.75} />
        {!expanded && Boolean(badgeCount && badgeCount > 0) && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm">
            {badgeCount}
          </span>
        )}
      </div>
      {expanded && (
        <div className="flex flex-1 items-center justify-between min-w-0 pr-1">
          <span className="truncate text-[15px] leading-tight">{label}</span>
          {Boolean(badgeCount && badgeCount > 0) && (
            <span className="ml-2 flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-semibold">
              {badgeCount}
            </span>
          )}
        </div>
      )}
    </Link>
  );

  const sellerTabLink = (key: SellerSectionKey, label: string, Icon: typeof Search) => {
    const active = resolvedSellerTab === key;
    const to = key === "account" ? "/creator?tab=account" : `/creator?tab=${key}`;
    const badge = key === "users" ? pendingCount : undefined;
    return sectionLink(key, to, Icon, label, active, badge);
  };

  return (
    <aside
      className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-border bg-background"
      style={{ width }}
    >
      <div className="flex flex-1 flex-col min-h-0 pt-4">
        <div className="flex flex-col gap-1 px-2">
          {isSellerProfile ? (
            SELLER_NAV_ITEMS.map((item) =>
              sellerTabLink(item.key, t(item.labelKey), item.icon),
            )
          ) : (
            BUYER_NAV_ITEMS.map((item) =>
              sectionLink(item.key, item.to, item.icon, t(item.labelKey), buyerSection === item.key),
            )
          )}
        </div>

        <div className="min-h-0 flex-1" aria-hidden />

        <div className="shrink-0 px-2">
          <ProfileAccountRows
            expanded={expanded}
            activeProfileId={activeProfileId}
            profiles={profiles}
            busyProfileId={busyProfileId}
            creatingType={creatingType}
            onSwitch={(profile) => {
              setBusyProfileId(profile.id);
              void runSwitch(profile, navigate, () => setBusyProfileId(null));
            }}
            onCreateSeller={(type, displayName, avatarFile) => {
              setCreatingType(type);
              return createSeller(type, displayName, navigate, () => setCreatingType(null), avatarFile);
            }}
            onToggleExpanded={toggleExpanded}
          />
        </div>
      </div>
    </aside>
  );
};

export { RAIL_COLLAPSED, RAIL_EXPANDED, RAIL_STORAGE_KEY, RAIL_CHANGE_EVENT };
export default AppNavigationRail;
