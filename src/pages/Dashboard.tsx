import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthSplash from "@/components/auth/AuthSplash";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { studentCreds, invokeApi } from "@/lib/sessionApi";
import AppHeader from "@/components/layout/AppHeader";
import BuyerAppShell from "@/components/layout/BuyerAppShell";
import BuyerMobileNav from "@/components/layout/BuyerMobileNav";
import { HeaderAccountControl, HeaderNotificationsButton } from "@/components/layout/HeaderControls";
import NotificationsTab from "@/components/dashboard/NotificationsTab";
import NotificationsDialog from "@/components/dashboard/NotificationsDialog";
import HomeTab from "@/components/dashboard/HomeTab";
import MessagesTab from "@/components/dashboard/MessagesTab";
import AccountTab from "@/components/dashboard/AccountTab";
import MaterialsTab from "@/components/dashboard/MaterialsTab";
import ScheduleTab from "@/components/dashboard/ScheduleTab";
import MaterialsProtectionNotice from "@/components/materials/MaterialsProtectionNotice";
import MaterialsScreenGuard from "@/components/materials/MaterialsScreenGuard";
import { useAccessibleProducts } from "@/hooks/useAccessibleProducts";
import { useRealtimeStudentNotifications } from "@/hooks/useRealtimeStudentNotifications";
import { useFCMRegistration } from "@/hooks/useFCMRegistration";
import { setAppBadge, clearAppBadge } from "@/lib/appBadge";
import { useAppResume } from "@/hooks/useAppResume";
import { useQuery } from "@tanstack/react-query";
import { buyerSectionFromPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const Dashboard = () => {
  const [lastViewedAt, setLastViewedAt] = useState<Date | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { user, status, profileType } = useSimpleAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAccountView = location.pathname === "/dashboard/account";
  const routeSection = buyerSectionFromPath(location.pathname) ?? "home";
  // Notifications are an overlay, not a destination: the section underneath stays put.
  const lastSectionPath = useRef("/dashboard");
  const buyerSection =
    routeSection === "notifications"
      ? buyerSectionFromPath(lastSectionPath.current) ?? "home"
      : routeSection;
  useAppResume();

  useEffect(() => {
    if (routeSection === "notifications") {
      setNotificationsOpen(true);
      navigate(lastSectionPath.current, { replace: true });
    } else if (!isAccountView) {
      lastSectionPath.current = location.pathname;
    }
  }, [routeSection, isAccountView, location.pathname, navigate]);

  const lastViewedKey = user?.id ? `student_notifications_last_viewed_${user.id}` : null;

  useEffect(() => {
    if (!lastViewedKey) return;
    const saved = localStorage.getItem(lastViewedKey);
    if (saved) setLastViewedAt(new Date(saved));
  }, [lastViewedKey]);

  const { data: purchasedProductIds = [] } = useQuery({
    queryKey: ["student-purchased-product-ids", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ purchases: { product_id: string }[] }>("checkout", {
        action: "list_my_purchases",
        ...studentCreds(),
        status: "completed",
      });
      return [...new Set((data.purchases ?? []).map((p) => p.product_id))];
    },
    enabled: !!user?.id,
  });

  const { productIds: accessibleProductIds } = useAccessibleProducts();

  const { data: cancellations = [] } = useQuery({
    queryKey: ["student-cancellations-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ cancellations: { id: string; cancelled_at: string; cancelled_by: string }[] }>("manage-bookings", {
        action: "list_cancellations",
        ...studentCreds(),
      });
      return (data.cancellations ?? [])
        .filter((c) => c.cancelled_by === "creator" || c.cancelled_by === "teacher")
        .sort((a, b) => new Date(b.cancelled_at).getTime() - new Date(a.cancelled_at).getTime())
        .slice(0, 50);
    },
    enabled: !!user?.id,
  });

  const { data: confirmedPurchases = [] } = useQuery({
    queryKey: ["student-confirmed-purchases-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ purchases: { id: string; created_at?: string; confirmed_at?: string | null }[] }>("checkout", {
        action: "list_my_purchases",
        ...studentCreds(),
        status: "completed",
      });
      return (data.purchases ?? [])
        .map((p) => ({ id: p.id, confirmed_at: p.confirmed_at || p.created_at || null }))
        .filter((p): p is { id: string; confirmed_at: string } => !!p.confirmed_at)
        .sort((a, b) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime())
        .slice(0, 50);
    },
    enabled: !!user?.id,
  });

  const { data: materialUnlocks = [] } = useQuery({
    queryKey: ["student-material-unlocks-count", purchasedProductIds],
    queryFn: async () => {
      if (purchasedProductIds.length === 0) return [];
      const data = await invokeApi<{ unlocks: { id: string; unlocked_at: string; product_id?: string | null }[] }>("manage-materials", {
        action: "list_unlocks",
        ...studentCreds(),
      });
      return (data.unlocks ?? [])
        .filter((u) => !u.product_id || purchasedProductIds.includes(u.product_id))
        .sort((a, b) => new Date(b.unlocked_at).getTime() - new Date(a.unlocked_at).getTime())
        .slice(0, 50);
    },
    enabled: purchasedProductIds.length > 0,
  });

  const { data: rejectedReschedules = [] } = useQuery({
    queryKey: ["student-rejected-reschedules-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ requests: { id: string; responded_at: string | null }[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        status: "rejected",
      });
      return (data.requests ?? [])
        .sort((a, b) => new Date(b.responded_at || 0).getTime() - new Date(a.responded_at || 0).getTime())
        .slice(0, 50);
    },
    enabled: !!user?.id,
  });

  const { data: incomingReschedules = [] } = useQuery({
    queryKey: ["student-incoming-reschedules-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ requests: { id: string; created_at: string; requested_by?: string }[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        status: "pending",
      });
      return (data.requests ?? [])
        .filter((r) => r.requested_by !== "student")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
    },
    enabled: !!user?.id,
  });

  const newNotificationsCount = useMemo(() => {
    const compareDate = lastViewedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newCancellations = cancellations.filter((c) => new Date(c.cancelled_at) > compareDate).length;
    const newPurchases = confirmedPurchases.filter((p) => p.confirmed_at && new Date(p.confirmed_at) > compareDate).length;
    const newUnlocks = materialUnlocks.filter((u) => new Date(u.unlocked_at) > compareDate).length;
    const newRejections = rejectedReschedules.filter((r) => r.responded_at && new Date(r.responded_at) > compareDate).length;
    const newIncoming = incomingReschedules.filter((r) => r.created_at && new Date(r.created_at) > compareDate).length;
    return newCancellations + newPurchases + newUnlocks + newRejections + newIncoming;
  }, [cancellations, confirmedPurchases, materialUnlocks, rejectedReschedules, incomingReschedules, lastViewedAt]);

  useRealtimeStudentNotifications(user?.id, !!user, newNotificationsCount, purchasedProductIds);

  useFCMRegistration({
    userId: user?.id,
    userRole: "student",
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!notificationsOpen) {
      setAppBadge(newNotificationsCount);
    }
  }, [newNotificationsCount, notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen || !lastViewedKey) return;
    const now = new Date();
    localStorage.setItem(lastViewedKey, now.toISOString());
    setLastViewedAt(now);
    clearAppBadge();
  }, [notificationsOpen, lastViewedKey]);

  useEffect(() => {
    if (status === "loading") return;
    if (profileType === "creator") {
      navigate("/creator");
      return;
    }
    if (profileType === "school") {
      navigate("/school");
      return;
    }
    if (!user) {
      navigate("/login?next=/dashboard", { replace: true });
    }
  }, [user, status, profileType, navigate]);

  if (status === "loading") {
    return <AuthSplash />;
  }

  if (!user) return null;

  const isMessages = !isAccountView && buyerSection === "announcements";
  // A section tapped inside a full-screen overlay navigates and drops the overlay.
  const closeOverlays = () => setNotificationsOpen(false);

  return (
    <BuyerAppShell
      activeSection={isAccountView ? undefined : buyerSection}
      mobileNav={
        <BuyerMobileNav
          activeTab={isAccountView ? "account" : notificationsOpen ? "notifications" : buyerSection}
        />
      }
    >
      <div
        className={cn(
          isMessages
            ? "flex h-[100dvh] flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
            : "min-h-screen pb-20 md:pb-6",
        )}
      >
        <AppHeader>
          <HeaderNotificationsButton
            active={notificationsOpen}
            count={newNotificationsCount}
            onClick={() => setNotificationsOpen(true)}
          />
          <HeaderAccountControl mobileNav={<BuyerMobileNav onNavigate={closeOverlays} />} />
        </AppHeader>

        {/* The messenger runs edge to edge and owns its own scrolling. */}
        <main className={isMessages ? "min-h-0 flex-1" : "px-4 py-6 md:px-6"}>
          {isAccountView ? (
            <div className="mx-auto max-w-5xl">
              <AccountTab />
            </div>
          ) : isMessages ? (
            <MessagesTab onBrowseCourses={() => navigate("/")} />
          ) : buyerSection === "schedule" ? (
            <ScheduleTab />
          ) : buyerSection === "materials" ? (
            <MaterialsScreenGuard>
              <MaterialsTab />
            </MaterialsScreenGuard>
          ) : (
            <HomeTab onBrowseCourses={() => navigate("/")} />
          )}
        </main>
      </div>

      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        mobileNav={<BuyerMobileNav onNavigate={closeOverlays} />}
      >
        <NotificationsTab lastViewedAt={lastViewedAt} purchasedProductIds={purchasedProductIds} />
      </NotificationsDialog>

      {/* Shown once for each product the buyer gets access to. */}
      <MaterialsProtectionNotice productIds={accessibleProductIds} />
    </BuyerAppShell>
  );
};

export default Dashboard;
