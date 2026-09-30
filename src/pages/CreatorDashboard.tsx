import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import CreatorProductsTab from "@/components/creator/CreatorProductsTab";
import CreatorUsersTab from "@/components/creator/CreatorUsersTab";
import CreatorScheduleTab from "@/components/creator/CreatorScheduleTab";
import CreatorNotificationsTab from "@/components/creator/CreatorNotificationsTab";
import CreatorAccountTab from "@/components/creator/CreatorAccountTab";
import CreatorMessagesTab from "@/components/creator/CreatorMessagesTab";
import CreatorMobileNav from "@/components/layout/CreatorMobileNav";
import NotificationsDialog from "@/components/dashboard/NotificationsDialog";
import CreatorMaterialsTab from "@/components/creator/CreatorMaterialsTab";
import { useCreatorPendingPurchases } from "@/components/creator/CreatorPendingPayments";
import { useLanguage } from "@/contexts/LanguageContext";
import AppHeader from "@/components/layout/AppHeader";
import AppShell from "@/components/layout/BuyerAppShell";
import {
  HeaderAccountControl,
  HeaderNotificationsButton,
} from "@/components/layout/HeaderControls";
import DisplayNameSetupDialog from "@/components/account/DisplayNameSetupDialog";
import { creatorTabFromPath, SELLER_NAV_ITEMS } from "@/lib/navigation";

import { useCreatorProducts } from "@/hooks/useProducts";
import { useCreatorSimpleBookings } from "@/hooks/useSimplePurchases";
import { useRealtimeBookingNotifications } from "@/hooks/useRealtimeBookings";
import { useRealtimePurchaseNotifications } from "@/hooks/useRealtimePurchases";
import { useFCMRegistration } from "@/hooks/useFCMRegistration";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";
import { setAppBadge, clearAppBadge } from "@/lib/appBadge";
import { useAppResume } from "@/hooks/useAppResume";
import { readAuthEmail } from "@/lib/creatorAuth";
import { needsDisplayNamePrompt } from "@/lib/displayName";
import { cn } from "@/lib/utils";

const CreatorDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = creatorTabFromPath("/creator", `?${searchParams.toString()}`);
  const activeTab = urlTab;
  // Notifications open over the current tab and close back onto it, like account settings.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(() => localStorage.getItem("profile_id"));
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastViewedAt, setLastViewedAt] = useState<Date | null>(null);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useAppResume();
  
  // Per-user localStorage key for last viewed notifications
  const lastViewedKey = creatorName ? `creator_notifications_last_viewed_${creatorName}` : null;

  // Load last viewed timestamp from localStorage
  useEffect(() => {
    if (!lastViewedKey) return;
    const stored = localStorage.getItem(lastViewedKey);
    if (stored) {
      setLastViewedAt(new Date(stored));
    }
  }, [lastViewedKey]);

  const handleTabChange = useCallback((value: string) => {
    setSearchParams({ tab: value });
  }, [setSearchParams]);

  // Opening the notifications overlay marks everything in it as seen.
  const openNotifications = useCallback(() => {
    setNotificationsOpen(true);
    if (!lastViewedKey) return;
    const now = new Date();
    localStorage.setItem(lastViewedKey, now.toISOString());
    setLastViewedAt(now);
    clearAppBadge();
  }, [lastViewedKey]);

  // A push or an old link may still point at ?tab=notifications — show it as the overlay.
  const rawTab = searchParams.get("tab");
  useEffect(() => {
    if (rawTab !== "notifications") return;
    openNotifications();
    setSearchParams({ tab: "products" }, { replace: true });
  }, [rawTab, openNotifications, setSearchParams]);
  
  // Получаем продукты и бронирования для подсчёта уведомлений
  const { data: products } = useCreatorProducts();
  const productIds = useMemo(() => products?.map(p => p.id) || [], [products]);
  const { data: bookings } = useCreatorSimpleBookings(productIds);
  
  const { data: pendingPurchases = [] } = useCreatorPendingPurchases(creatorName);

  // Получаем отменённые записи для подсчёта
  const { data: cancellations } = useQuery({
    queryKey: ["creator-cancellations-count", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ cancellations: { id: string; cancelled_at: string; cancelled_by: string }[] }>("manage-bookings", {
        action: "list_cancellations",
        ...creatorCreds(),
        productIds,
      });
      return (data.cancellations ?? []).filter((c) => c.cancelled_by === "student");
    },
    enabled: productIds.length > 0,
  });

  // Получаем запросы на перенос для подсчёта бейджа
  const { data: rescheduleRequests } = useQuery({
    queryKey: ["creator-reschedule-requests-count", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ requests: { id: string; created_at: string }[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...creatorCreds(),
        productIds,
        status: "pending",
        requestedBy: "student",
      });
      return data.requests ?? [];
    },
    enabled: productIds.length > 0,
  });
  
  // Подсчёт новых записей, покупок и отменённых записей после последнего просмотра
  const newNotificationsCount = useMemo(() => {
    // If never viewed, count all pending purchases and bookings from last 24 hours
    const compareDate = lastViewedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const newBookingsCount = bookings?.filter(b => {
      const createdAt = new Date(b.created_at);
      return createdAt > compareDate;
    }).length || 0;
    
    const newPurchasesCount = pendingPurchases?.filter(p => {
      const createdAt = new Date(p.created_at);
      return createdAt > compareDate;
    }).length || 0;

    const newCancellationsCount = cancellations?.filter(c => {
      const cancelledAt = new Date((c as any).cancelled_at);
      return cancelledAt > compareDate;
    }).length || 0;

    const newRescheduleCount = rescheduleRequests?.filter(r => {
      const createdAt = new Date(r.created_at);
      return createdAt > compareDate;
    }).length || 0;
    
    return newBookingsCount + newPurchasesCount + newCancellationsCount + newRescheduleCount;
  }, [bookings, pendingPurchases, cancellations, rescheduleRequests, lastViewedAt]);

  // Set initial app badge based on notification count
  useEffect(() => {
    if (!notificationsOpen) {
      // Set badge to current unread count
      setAppBadge(newNotificationsCount);
    }
  }, [newNotificationsCount, notificationsOpen]);

  // Enable real-time notifications for new bookings and purchases (with badge count)
  useRealtimeBookingNotifications(productIds, productIds.length > 0, newNotificationsCount);
  useRealtimePurchaseNotifications(productIds, productIds.length > 0);

  // Register FCM token for push notifications
  useFCMRegistration({
    userId: creatorName || undefined,
    userRole: "creator",
    enabled: !!creatorName
  });

  useEffect(() => {
    const validateSession = async () => {
      const name = localStorage.getItem("creator_name");
      const token = localStorage.getItem("creator_token");
      const profileType = localStorage.getItem("profile_type");
      if (profileType === "buyer") {
        navigate("/dashboard");
        return;
      }
      if (profileType === "school") {
        navigate("/school");
        return;
      }

      if (!name || !token) {
        navigate("/");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('validate-creator-session', {
          body: { token, creatorName: name }
        });

        if (error) {
          // Network/transport error — keep session, continue with cached name
          console.warn('Session validation network error, using cached session:', error);
          setCreatorName(name);
          setIsLoading(false);
          return;
        }

        if (!data?.valid) {
          console.log('Invalid creator session, redirecting to login');
          localStorage.removeItem("creator_token");
          localStorage.removeItem("creator_name");
          navigate("/");
          return;
        }

        setCreatorName(name);
        if (typeof data.profileId === "string" && data.profileId) {
          setProfileId(data.profileId);
          localStorage.setItem("profile_id", data.profileId);
        }
        const displayName =
          typeof data.displayName === "string" ? data.displayName.trim() : localStorage.getItem("profile_display_name") || "";
        if (displayName) localStorage.setItem("profile_display_name", displayName);
        setProfileDisplayName(displayName || null);
        const email = typeof data.email === "string" ? data.email : readAuthEmail();
        setNeedsDisplayName(needsDisplayNamePrompt(displayName, email));
        setIsLoading(false);
      } catch (err) {
        console.error('Session validation error:', err);
        // Network error — don't remove session, use cached name
        setCreatorName(name);
        setIsLoading(false);
      }
    };

    validateSession();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!creatorName) return null;

  const isMessages = activeTab === "announcements";

  if (needsDisplayName) {
    return (
      <div className="min-h-screen bg-background">
        <DisplayNameSetupDialog
          open
          onSaved={(saved) => {
            setProfileDisplayName(saved);
            setNeedsDisplayName(false);
          }}
        />
      </div>
    );
  }

  return (
    <AppShell sellerTab={urlTab}>
    <div
      className={cn(
        "bg-background",
        isMessages ? "flex h-[100dvh] flex-col overflow-hidden" : "min-h-screen",
        isMobile && (isMessages ? "pb-[calc(4rem+env(safe-area-inset-bottom))]" : "pb-20"),
      )}
    >
      <AppHeader>
        <HeaderNotificationsButton
          active={notificationsOpen}
          count={newNotificationsCount}
          onClick={openNotifications}
        />
        <HeaderAccountControl
          mobileNav={<CreatorMobileNav activeTab={activeTab} onTabChange={handleTabChange} />}
        />
      </AppHeader>

      {/* The messenger runs edge to edge and owns its own scrolling. */}
      <main
        className={
          isMessages ? "min-h-0 flex-1" : isMobile ? "px-4 py-6" : "mx-auto w-full max-w-5xl px-6 py-6"
        }
      >
          {activeTab === "products" && (
            <div className="animate-fade-in">
              <CreatorProductsTab creatorName={creatorName} onOpenUsers={() => handleTabChange("users")} />
            </div>
          )}
          {isMessages && (
            <div className="h-full animate-fade-in">
              <CreatorMessagesTab
                creatorName={creatorName}
                supportDisplayName={profileDisplayName || creatorName}
                onGoToProducts={() => handleTabChange("products")}
              />
            </div>
          )}
          {activeTab === "materials" && (
            <div className="animate-fade-in">
              <CreatorMaterialsTab creatorName={creatorName} onGoToProducts={() => handleTabChange("products")} />
            </div>
          )}
          {activeTab === "schedule" && (
            <div className="animate-fade-in">
              <CreatorScheduleTab creatorName={creatorName} onGoToProducts={() => handleTabChange("products")} />
            </div>
          )}
          {activeTab === "users" && (
            <div className="animate-fade-in">
              <CreatorUsersTab creatorName={creatorName} />
            </div>
          )}
          {activeTab === "account" && (
            <div className="animate-fade-in">
              <CreatorAccountTab creatorName={creatorName} />
            </div>
          )}
        </main>

      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        mobileNav={
          <CreatorMobileNav
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onNavigate={() => setNotificationsOpen(false)}
          />
        }
      >
        <CreatorNotificationsTab
          creatorName={creatorName}
          lastViewedAt={lastViewedAt}
          onOpenUsers={() => {
            setNotificationsOpen(false);
            handleTabChange("users");
          }}
        />
      </NotificationsDialog>

      {/* Bottom Navigation - Mobile Only */}
      {isMobile && <CreatorMobileNav activeTab={activeTab} onTabChange={handleTabChange} />}
    </div>
    </AppShell>
  );
};

export default CreatorDashboard;
