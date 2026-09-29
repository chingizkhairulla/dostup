import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, FileText, Loader2 } from "lucide-react";
import SupportChat from "@/components/SupportChat";
import { useSupportUnread } from "@/hooks/useSupportUnread";
import { useLanguage } from "@/contexts/LanguageContext";
import AppHeader from "@/components/layout/AppHeader";
import {
  HeaderChatsButton,
  HeaderNotificationsButton,
  TeacherHeaderAccount,
} from "@/components/layout/HeaderControls";

import { useIsMobile } from "@/hooks/use-mobile";
import TeacherScheduleTab from "@/components/teacher/TeacherScheduleTab";
import TeacherMaterialsTab from "@/components/teacher/TeacherMaterialsTab";
import TeacherNotificationsTab from "@/components/teacher/TeacherNotificationsTab";
import TeacherAccountTab from "@/components/teacher/TeacherAccountTab";
import { useQuery } from "@tanstack/react-query";
import { sessionCreds, studentCreds, invokeApi } from "@/lib/sessionApi";
import { useFCMRegistration } from "@/hooks/useFCMRegistration";
import { useRealtimeTeacherNotifications } from "@/hooks/useRealtimeTeacherNotifications";
import { setAppBadge, clearAppBadge } from "@/lib/appBadge";
import { unregisterPushToken } from "@/lib/firebase";
import { useAppResume } from "@/hooks/useAppResume";

const TeacherDashboard = () => {
  const [activeTab, setActiveTab] = useState("schedule");
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastViewedAt, setLastViewedAt] = useState<Date | null>(null);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useAppResume();

  // Load teacher data from localStorage
  useEffect(() => {
    const teacherDataStr = localStorage.getItem("teacher_data");
    if (!teacherDataStr) {
      navigate("/");
    } else {
      try {
        const teacherData = JSON.parse(teacherDataStr);
        setTeacherName(teacherData.name);
      } catch {
        navigate("/");
      }
      setIsLoading(false);
    }
  }, [navigate]);

  // Per-user localStorage key for last viewed notifications
  const lastViewedKey = teacherName ? `teacher_notifications_last_viewed_${teacherName}` : null;

  // Load last viewed timestamp
  useEffect(() => {
    if (!lastViewedKey) return;
    const stored = localStorage.getItem(lastViewedKey);
    if (stored) {
      setLastViewedAt(new Date(stored));
    }
  }, [lastViewedKey]);

  // Get products where this teacher has access
  const { data: teacherProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ["teacher-products", teacherName],
    queryFn: async () => {
      const data = await invokeApi<{ products: { id: string }[] }>("manage-products", {
        action: "list",
        ...sessionCreds(),
      });
      return data.products ?? [];
    },
    enabled: !!teacherName,
  });
  const productIds = useMemo(() => teacherProducts.map(p => p.id), [teacherProducts]);

  // Get teacher user record
  const { data: teacherUser } = useQuery({
    queryKey: ["teacher-user", teacherName],
    queryFn: async () => {
      const data = await invokeApi<{ userId: string | null; name?: string; role?: string }>("manage-schedules", {
        action: "me",
        ...studentCreds(),
      });
      return data.userId ? { id: data.userId } : null;
    },
    enabled: !!teacherName,
  });
  const supportUnread = useSupportUnread("teacher", teacherUser?.id || teacherName || "");

  // Get teacher's schedule IDs for notifications
  const { data: teacherSchedules = [] } = useQuery({
    queryKey: ["teacher-schedules", teacherName],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ schedules: { id: string; product_id: string; title: string; product?: { title: string } | null }[] }>("manage-schedules", {
        action: "list_schedules",
        ...studentCreds(),
        productIds,
      });
      return data.schedules ?? [];
    },
    enabled: !!teacherName && productIds.length > 0,
  });

  const scheduleIds = useMemo(() => teacherSchedules.map(s => s.id), [teacherSchedules]);

  // Register FCM for teacher push notifications
  useFCMRegistration({
    userId: teacherUser?.id,
    userRole: "teacher",
    enabled: !!teacherUser?.id,
  });

  // Get bookings for notification count - use same key as notification tab
  const { data: bookings = [] } = useQuery({
    queryKey: ["teacher-notification-bookings", scheduleIds],
    queryFn: async () => {
      if (!scheduleIds.length) return [];
      const slotsData = await invokeApi<{ slots: { id: string; date: string; start_time: string; end_time: string; schedule_id: string; created_at?: string }[] }>("manage-schedules", {
        action: "list_slots",
        ...studentCreds(),
        scheduleIds,
      });
      const slots = slotsData.slots ?? [];
      const slotIds = slots.map((s) => s.id);
      if (!slotIds.length) return [];
      const bookingsData = await invokeApi<{ bookings: {
        id: string;
        time_slot_id: string;
        simple_user_id: string;
        schedule_id: string;
        status: string;
        created_at?: string;
        user: { id: string; name: string; phone: string } | null;
      }[] }>("manage-schedules", {
        action: "list_bookings_for_slots",
        ...studentCreds(),
        slotIds,
      });
      const slotMap = new Map(slots.map((s) => [s.id, s]));
      const scheduleMap = new Map(teacherSchedules.map((s) => [s.id, s]));
      return (bookingsData.bookings ?? [])
        .filter((b) => b.status === "confirmed")
        .map((b) => {
          const slot = slotMap.get(b.time_slot_id);
          const schedule = scheduleMap.get(b.schedule_id);
          return {
            id: b.id,
            created_at: b.created_at || slot?.created_at || "",
            time_slot: slot ? { date: slot.date, start_time: slot.start_time, end_time: slot.end_time } : null,
            schedule: schedule ? { title: schedule.title, product: schedule.product ?? null } : null,
            user: b.user,
          };
        });
    },
    enabled: scheduleIds.length > 0,
  });

  // Get cancellations - use same key as notification tab
  const { data: cancellations = [] } = useQuery({
    queryKey: ["teacher-notification-cancellations", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ cancellations: { id: string; cancelled_by: string; cancelled_at: string }[] }>("manage-bookings", {
        action: "list_cancellations",
        ...studentCreds(),
        productIds,
      });
      return (data.cancellations ?? []).filter((c) => c.cancelled_by === "student");
    },
    enabled: productIds.length > 0,
  });

  // Get pending reschedule requests for badge count
  const { data: rescheduleRequests = [] } = useQuery({
    queryKey: ["teacher-reschedule-requests-count", scheduleIds],
    queryFn: async () => {
      if (!scheduleIds.length) return [];
      const data = await invokeApi<{ requests: { id: string; created_at: string }[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        scheduleIds,
        status: "pending",
        requestedBy: "student",
      });
      return data.requests ?? [];
    },
    enabled: scheduleIds.length > 0,
  });

  // Get reschedule responses (teacher requested, student responded) for badge count
  const { data: rescheduleResponses = [] } = useQuery({
    queryKey: ["teacher-reschedule-responses-count", scheduleIds],
    queryFn: async () => {
      if (!scheduleIds.length) return [];
      const data = await invokeApi<{ requests: { id: string; responded_at: string | null; status: string }[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        scheduleIds,
        requestedBy: "teacher",
      });
      return (data.requests ?? []).filter((r) => r.status === "approved" || r.status === "rejected");
    },
    enabled: scheduleIds.length > 0,
  });

  // Count new notifications
  const newNotificationsCount = useMemo(() => {
    const compareDate = lastViewedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const newBookingsCount = bookings.filter(b => new Date(b.created_at) > compareDate).length;
    const newCancellationsCount = cancellations.filter(c => new Date(c.cancelled_at) > compareDate).length;
    const newRescheduleCount = rescheduleRequests.filter(r => new Date(r.created_at) > compareDate).length;
    const newResponsesCount = rescheduleResponses.filter(r => r.responded_at && new Date(r.responded_at) > compareDate).length;
    
    return newBookingsCount + newCancellationsCount + newRescheduleCount + newResponsesCount;
  }, [bookings, cancellations, rescheduleRequests, rescheduleResponses, lastViewedAt]);

  // Real-time notifications for teacher bookings/cancellations (with badge count)
  useRealtimeTeacherNotifications(
    teacherName,
    scheduleIds,
    scheduleIds.length > 0,
    newNotificationsCount
  );
  
  // Set initial app badge based on notification count
  useEffect(() => {
    if (activeTab !== "notifications") {
      setAppBadge(newNotificationsCount);
    }
  }, [newNotificationsCount, activeTab]);

  // Handle tab change - update last viewed when entering OR leaving notifications
  const handleTabChange = useCallback((value: string) => {
    if (lastViewedKey && (value === "notifications" || (activeTab === "notifications" && value !== "notifications"))) {
      const now = new Date();
      localStorage.setItem(lastViewedKey, now.toISOString());
      setLastViewedAt(now);
      clearAppBadge();
    }
    setActiveTab(value);
  }, [activeTab, lastViewedKey]);

  const handleTeacherSignOut = useCallback(async () => {
    if (teacherUser?.id) {
      await unregisterPushToken(teacherUser.id).catch(console.error);
    }
    localStorage.removeItem("teacher_data");
    localStorage.removeItem("teacher_notifications_last_viewed");
    localStorage.removeItem("simple_session_token");
    localStorage.removeItem("simple_user_id");
    navigate("/");
  }, [navigate, teacherUser?.id]);

  if (isLoading || productsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!teacherName) return null;

  return (
    <div className={`min-h-screen bg-background ${isMobile ? "pb-20" : ""}`}>
      {/* Header */}
      <AppHeader>
        <HeaderChatsButton
          active={activeTab === "support"}
          unread={supportUnread}
          onClick={() => handleTabChange("support")}
        />
        <HeaderNotificationsButton
          active={activeTab === "notifications"}
          count={newNotificationsCount}
          onClick={() => handleTabChange("notifications")}
        />
        <TeacherHeaderAccount
          displayName={teacherName}
          onAccount={() => handleTabChange("account")}
          onSignOut={() => void handleTeacherSignOut()}
        />
      </AppHeader>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Desktop Top Tabs */}
          {!isMobile && (
            <TabsList className="mb-6 grid h-12 w-full grid-cols-2">
              <TabsTrigger value="schedule" className="gap-2">
                <Calendar className="w-4 h-4" />
                {t("schedule")}
              </TabsTrigger>
              <TabsTrigger value="materials" className="gap-2">
                <FileText className="w-4 h-4" />
                {t("materials")}
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="schedule" className="mt-0 animate-fade-in">
            <TeacherScheduleTab teacherName={teacherName} productIds={productIds} />
          </TabsContent>
          <TabsContent value="materials" className="mt-0 animate-fade-in">
            <TeacherMaterialsTab productIds={productIds} teacherName={teacherName} />
          </TabsContent>
          <TabsContent value="notifications" className="mt-0 animate-fade-in">
            <TeacherNotificationsTab 
              teacherName={teacherName} 
              productIds={productIds} 
              lastViewedAt={lastViewedAt} 
            />
          </TabsContent>
          <TabsContent value="account" className="mt-0 animate-fade-in">
            <TeacherAccountTab teacherName={teacherName} teacherId={teacherUser?.id} />
          </TabsContent>
          <TabsContent value="support" className="mt-0 animate-fade-in">
            <SupportChat userType="teacher" userRef={teacherUser?.id || teacherName} displayName={teacherName} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Bottom Navigation - Mobile Only */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/80 backdrop-blur-lg safe-area-inset">
          <div className="mx-auto max-w-2xl">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="grid h-16 w-full grid-cols-2 gap-1 rounded-none bg-transparent">
                <TabsTrigger
                  value="schedule"
                  className="h-full flex-col gap-1 rounded-none data-[state=active]:bg-transparent data-[state=active]:text-primary"
                >
                  <Calendar className="h-5 w-5" />
                  <span className="text-xs">{t("schedule")}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="materials"
                  className="h-full flex-col gap-1 rounded-none data-[state=active]:bg-transparent data-[state=active]:text-primary"
                >
                  <FileText className="h-5 w-5" />
                  <span className="text-xs">{t("materials")}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </nav>
      )}
    </div>
  );
};

export default TeacherDashboard;
