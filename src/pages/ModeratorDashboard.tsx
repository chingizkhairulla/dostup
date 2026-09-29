import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  LogOut,
  Lock,
  Unlock,
  Trash2,
  MessageCircle,
  Users,
  School,
  GraduationCap,
  Search,
  ExternalLink,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  MessageSquare,
  MessageSquarePlus,
  Settings,
  Check,
  X,
  ChevronRight,
  Edit,
  Bell,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import SupportChat from "@/components/SupportChat";
import { AppLogoLink } from "@/components/auth/AuthMark";
import { clearAppSession } from "@/lib/creatorAuth";
import { HeaderChatsButton, HeaderNotificationsButton } from "@/components/layout/HeaderControls";
import ModeratorSettingsDialog from "@/components/account/ModeratorSettingsDialog";
import { registerPushToken } from "@/lib/firebase";
import { useFCMRegistration } from "@/hooks/useFCMRegistration";
import { cn } from "@/lib/utils";

interface CreatorRow {
  id: string;
  login: string;
  display_name: string;
  account_type: string;
  is_blocked: boolean;
  created_at: string;
  students_count: number;
  revenue: number;
  products_count: number;
  teachers_count?: number;
}

interface Totals {
  creators: number;
  students: number;
  revenue: number;
  products: number;
  teachers?: number;
  pending_topics?: number;
  pending_reports?: number;
  course_creators?: {
    count: number;
    revenue: number;
    students: number;
    products: number;
  };
  online_schools?: {
    count: number;
    revenue: number;
    students: number;
    teachers: number;
    products: number;
  };
}

interface TopicSuggestion {
  id: string;
  name: string;
  normalized_name: string;
  category_id: string;
  subcategory_id?: string;
  category_name: string;
  subcategory_name?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  created_by?: string;
}

interface ProductReport {
  id: string;
  product_id: string;
  user_id?: string;
  reporter_name?: string;
  reporter_contact?: string;
  reason: string;
  description?: string;
  status: "pending" | "resolved" | "dismissed";
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  products?: {
    id: string;
    title: string;
    creator_id: string;
  };
}

interface Thread {
  id: string;
  user_type: string;
  user_ref: string;
  display_name: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_for_moderator: number;
}

type SellerMode = "all" | "course_creator" | "online_school";

type ModeratorSection = "sellers" | "topic_suggestions" | "reports" | "improvements" | "support";

interface ModeratorNavItem {
  key: ModeratorSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODERATOR_NAV_ITEMS: ModeratorNavItem[] = [
  {
    key: "sellers",
    label: "Продавцы",
    shortLabel: "Продавцы",
    icon: Users,
  },
  {
    key: "topic_suggestions",
    label: "Предложения новых тем",
    shortLabel: "Новые темы",
    icon: Lightbulb,
  },
  {
    key: "reports",
    label: "Жалобы на продукты",
    shortLabel: "Жалобы",
    icon: AlertTriangle,
  },
  {
    key: "support",
    label: "Сообщения",
    shortLabel: "Сообщения",
    icon: MessageSquare,
  },
];

const ModeratorDashboard = () => {
  const navigate = useNavigate();
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const [token, setToken] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("moderator_token") || "" : ""
  );

  const [activeSection, setActiveSection] = useState<ModeratorSection>("sellers");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sellerMode, setSellerMode] = useState<SellerMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ creators: 0, students: 0, revenue: 0, products: 0 });
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);

  const [topicSuggestions, setTopicSuggestions] = useState<TopicSuggestion[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [actionBusyTopicId, setActionBusyTopicId] = useState<string | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicName, setEditingTopicName] = useState("");

  const [reports, setReports] = useState<ProductReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [actionBusyReportId, setActionBusyReportId] = useState<string | null>(null);
  const [reportsFilter, setReportsFilter] = useState<"all" | "pending" | "resolved" | "dismissed">("pending");

  const [pushEnabled, setPushEnabled] = useState(() =>
    typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
  );

  // Автоматическая регистрация push-уведомлений для модератора
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        setPushEnabled(true);
      } else if (Notification.permission === "default") {
        Notification.requestPermission()
          .then((perm) => {
            if (perm === "granted") setPushEnabled(true);
          })
          .catch(console.error);
      }
    }
  }, []);

  useFCMRegistration({
    userId: token,
    userRole: "moderator",
    enabled: !!token,
  });

  const pendingTopicsCount = useMemo(() => {
    return topicSuggestions.filter((t) => t.status === "pending").length || totals.pending_topics || 0;
  }, [topicSuggestions, totals.pending_topics]);

  const pendingReportsCount = useMemo(() => {
    return reports.filter((r) => r.status === "pending").length || totals.pending_reports || 0;
  }, [reports, totals.pending_reports]);

  // Число чатов, в которых есть непрочитанные сообщения (если несколько сообщений в 1 чате, счетчик равен 1)
  const unreadChatsCount = useMemo(() => {
    return threads.filter((t) => (t.unread_for_moderator || 0) > 0).length;
  }, [threads]);

  const [selectedCreator, setSelectedCreator] = useState<CreatorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CreatorRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const call = useCallback(
    async (body: Record<string, unknown>, overrideToken?: string) => {
      const activeToken =
        overrideToken ??
        token ??
        (typeof window !== "undefined" ? localStorage.getItem("moderator_token") || "" : "");
      const resp = await fetch(`${baseUrl}/functions/v1/moderator-api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ ...body, token: activeToken }),
      });
      return resp.json();
    },
    [baseUrl, anonKey, token]
  );

  const loadStats = useCallback(
    async (overrideToken?: string) => {
      const data = await call({ action: "stats" }, overrideToken);
      if (data?.success) {
        setCreators(data.creators);
        setTotals(data.totals);
      }
    },
    [call]
  );

  const loadThreads = useCallback(
    async (overrideToken?: string) => {
      const data = await call({ action: "support_list_threads" }, overrideToken);
      if (data?.success) setThreads(data.threads);
    },
    [call]
  );

  const loadTopicSuggestions = useCallback(
    async (overrideToken?: string) => {
      try {
        setLoadingTopics(true);
        const data = await call({ action: "list_topic_suggestions", status: "pending" }, overrideToken);
        if (data?.success) {
          setTopicSuggestions(data.topics || []);
        }
      } catch (err) {
        console.error("Failed to load topic suggestions:", err);
      } finally {
        setLoadingTopics(false);
      }
    },
    [call]
  );

  const loadReports = useCallback(
    async (overrideToken?: string) => {
      try {
        setLoadingReports(true);
        const data = await call({ action: "list_reports" }, overrideToken);
        if (data?.success) {
          setReports(data.reports || []);
        }
      } catch (err) {
        console.error("Failed to load reports:", err);
      } finally {
        setLoadingReports(false);
      }
    },
    [call]
  );

  const handleUpdateReportStatus = async (reportId: string, newStatus: "resolved" | "dismissed") => {
    setActionBusyReportId(reportId);
    try {
      const data = await call({
        action: "update_report_status",
        report_id: reportId,
        status: newStatus,
      });
      if (data?.success) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r))
        );
        toast.success(newStatus === "resolved" ? "Жалоба решена" : "Жалоба отклонена");
        void loadStats();
      } else {
        toast.error(data?.error || "Не удалось обновить статус жалобы");
      }
    } catch (err) {
      toast.error("Ошибка при обновлении статуса");
    } finally {
      setActionBusyReportId(null);
    }
  };

  const handleEnablePushNotifications = async () => {
    if (!("Notification" in window)) {
      toast.error("Для уведомлений на iPhone добавьте сайт на экран «Домой» (Поделиться → На экран «Домой»)");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        const success = await registerPushToken(token, "moderator");
        if (success) {
          setPushEnabled(true);
          toast.success("Уведомления на телефон успешно подключены!");
        } else {
          toast.error("Не удалось зарегистрировать устройство для уведомлений");
        }
      } else {
        toast.error("Разрешение на уведомления отклонено в браузере");
      }
    } catch (err) {
      console.error(err);
      toast.error("Ошибка при запросе разрешения");
    }
  };

  const handleSaveEditedTopic = async (topicId: string) => {
    if (!editingTopicName.trim()) {
      toast.error("Название темы не может быть пустым");
      return;
    }
    setActionBusyTopicId(topicId);
    try {
      const res = await call({
        action: "update_topic_suggestion",
        topic_id: topicId,
        name: editingTopicName.trim(),
      });
      if (res?.success) {
        toast.success("Тема успешно изменена");
        setTopicSuggestions((prev) =>
          prev.map((t) =>
            t.id === topicId ? { ...t, name: editingTopicName.trim() } : t
          )
        );
        setEditingTopicId(null);
      } else {
        toast.error(res?.error || "Не удалось изменить тему");
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка при изменении темы");
    } finally {
      setActionBusyTopicId(null);
    }
  };

  const handleApproveTopic = async (topicId: string, customName?: string) => {
    setActionBusyTopicId(topicId);
    try {
      const nameToSend = customName || (editingTopicId === topicId ? editingTopicName.trim() : undefined);
      const res = await call({
        action: "approve_topic_suggestion",
        topic_id: topicId,
        name: nameToSend,
      });
      if (res?.success) {
        toast.success("Тема одобрена и доступна всем пользователям");
        setTopicSuggestions((prev) => prev.filter((t) => t.id !== topicId));
        setEditingTopicId(null);
        void loadStats();
      } else {
        toast.error(res?.error || "Не удалось одобрить тему");
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка при одобрении темы");
    } finally {
      setActionBusyTopicId(null);
    }
  };

  const handleRejectTopic = async (topicId: string) => {
    setActionBusyTopicId(topicId);
    try {
      const res = await call({ action: "reject_topic_suggestion", topic_id: topicId });
      if (res?.success) {
        toast.info("Тема отклонена");
        setTopicSuggestions((prev) => prev.filter((t) => t.id !== topicId));
        void loadStats();
      } else {
        toast.error(res?.error || "Не удалось отклонить тему");
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка при отклонении темы");
    } finally {
      setActionBusyTopicId(null);
    }
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      const currentToken =
        typeof window !== "undefined" ? localStorage.getItem("moderator_token") || "" : "";

      if (currentToken) {
        const v = await call({ action: "validate" }, currentToken);
        if (v?.success) {
          if (!active) return;
          setToken(currentToken);
          await Promise.all([
            loadStats(currentToken),
            loadThreads(currentToken),
            loadTopicSuggestions(currentToken),
            loadReports(currentToken),
          ]);
          setLoading(false);
          return;
        }
        localStorage.removeItem("moderator_token");
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email?.trim().toLowerCase() === "dostup.support@gmail.com") {
          const { data: claimedToken, error } = await (supabase.rpc as any)("claim_moderator_session");
          if (!error && claimedToken && typeof claimedToken === "string") {
            localStorage.setItem("moderator_token", claimedToken);
            if (!active) return;
            setToken(claimedToken);
            await Promise.all([
              loadStats(claimedToken),
              loadThreads(claimedToken),
              loadTopicSuggestions(claimedToken),
              loadReports(claimedToken),
            ]);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Moderator auth check failed:", err);
      }

      if (active) {
        navigate("/");
      }
    };

    init();

    return () => {
      active = false;
    };
  }, [navigate, call, loadStats, loadThreads, loadTopicSuggestions, loadReports]);

  // Realtime threads
  useEffect(() => {
    if (!token) return;
    const ch = supabase
      .channel("mod-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, () =>
        loadThreads(token)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadThreads, token]);

  // Realtime topics
  useEffect(() => {
    if (!token) return;
    const ch = supabase
      .channel("mod-topics")
      .on("postgres_changes", { event: "*", schema: "public", table: "topics" }, () => {
        void loadTopicSuggestions(token);
        void loadStats(token);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadTopicSuggestions, loadStats, token]);

  // Realtime reports
  useEffect(() => {
    if (!token) return;
    const ch = supabase
      .channel("mod-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_reports" }, () => {
        void loadReports(token);
        void loadStats(token);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadReports, loadStats, token]);

  const logout = async () => {
    localStorage.removeItem("moderator_token");
    setToken("");
    clearAppSession();
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  const toggleBlock = async (c: CreatorRow) => {
    setBusyId(c.id);
    const data = await call({ action: "block_creator", creator_id: c.id, blocked: !c.is_blocked });
    setBusyId(null);
    if (data?.success) {
      toast.success(c.is_blocked ? "Разблокирован" : "Заблокирован");
      loadStats();
    } else {
      toast.error(data?.error || "Ошибка");
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const data = await call({ action: "delete_creator", creator_id: deleteTarget.id });
    setBusyId(null);
    if (data?.success) {
      toast.success("Аккаунт удалён");
      setDeleteTarget(null);
      loadStats();
    } else {
      toast.error(data?.error || "Ошибка");
    }
  };

  const totalUnread = useMemo(
    () => threads.reduce((s, t) => s + (t.unread_for_moderator || 0), 0),
    [threads]
  );

  // Категоризация продавцов по режимам
  const courseCreators = useMemo(
    () =>
      creators.filter(
        (c) => c.account_type === "course_creator" || c.account_type === "creator"
      ),
    [creators]
  );

  const onlineSchools = useMemo(
    () =>
      creators.filter(
        (c) => c.account_type === "online_school" || c.account_type === "school"
      ),
    [creators]
  );

  const courseStats = useMemo(() => {
    const count = courseCreators.length;
    const students = courseCreators.reduce((s, c) => s + (c.students_count || 0), 0);
    const products = courseCreators.reduce((s, c) => s + (c.products_count || 0), 0);
    const revenue = courseCreators.reduce((s, c) => s + (c.revenue || 0), 0);
    const avgRevenue = count ? Math.round(revenue / count) : 0;
    return { count, students, products, revenue, avgRevenue };
  }, [courseCreators]);

  const schoolStats = useMemo(() => {
    const count = onlineSchools.length;
    const teachers = onlineSchools.reduce((s, c) => s + (c.teachers_count || 0), 0);
    const students = onlineSchools.reduce((s, c) => s + (c.students_count || 0), 0);
    const products = onlineSchools.reduce((s, c) => s + (c.products_count || 0), 0);
    const revenue = onlineSchools.reduce((s, c) => s + (c.revenue || 0), 0);
    return { count, teachers, students, products, revenue };
  }, [onlineSchools]);

  const allStats = useMemo(() => {
    const count = creators.length;
    const students = totals.students || creators.reduce((s, c) => s + (c.students_count || 0), 0);
    const products = totals.products || creators.reduce((s, c) => s + (c.products_count || 0), 0);
    const revenue = totals.revenue || creators.reduce((s, c) => s + (c.revenue || 0), 0);
    const teachers = schoolStats.teachers;
    return { count, students, products, revenue, teachers };
  }, [creators, totals, schoolStats]);

  const filteredCreators = useMemo(() => {
    let list = creators;
    if (sellerMode === "course_creator") list = courseCreators;
    else if (sellerMode === "online_school") list = onlineSchools;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (c) => c.display_name.toLowerCase().includes(q) || c.login.toLowerCase().includes(q)
    );
  }, [creators, courseCreators, onlineSchools, sellerMode, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Левая панель на десктопе */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border bg-card/60 backdrop-blur-sm">
        <div className="flex h-16 items-center px-5 border-b border-border/70">
          <AppLogoLink markClassName="h-auto w-24" />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {MODERATOR_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={cn(
                  "w-full relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left",
                  active
                    ? "bg-[#FF6B00]/10 text-[#FF6B00] font-semibold"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {active && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#FF6B00]"
                    aria-hidden
                  />
                )}
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.key === "topic_suggestions" && pendingTopicsCount > 0 && (
                  <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FF6B00] text-white text-[11px] font-bold shadow-xs">
                    {pendingTopicsCount}
                  </span>
                )}
                {item.key === "reports" && pendingReportsCount > 0 && (
                  <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FF6B00] text-white text-[11px] font-bold shadow-xs">
                    {pendingReportsCount}
                  </span>
                )}
                {item.key === "support" && unreadChatsCount > 0 && (
                  <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FF6B00] text-white text-[11px] font-bold shadow-xs">
                    {unreadChatsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Нижняя панель на телефоне */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg safe-area-inset md:hidden">
        <div className="grid h-16 grid-cols-4">
          {MODERATOR_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 transition-colors",
                  active ? "text-[#FF6B00]" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {item.key === "topic_suggestions" && pendingTopicsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[10px] font-bold text-white shadow-xs">
                      {pendingTopicsCount}
                    </span>
                  )}
                  {item.key === "reports" && pendingReportsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[10px] font-bold text-white shadow-xs">
                      {pendingReportsCount}
                    </span>
                  )}
                  {item.key === "support" && unreadChatsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[10px] font-bold text-white shadow-xs">
                      {unreadChatsCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] leading-tight font-medium truncate max-w-[72px]">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Основная часть контента */}
      <div className="md:pl-64 flex flex-col min-h-screen pb-20 md:pb-8">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="md:hidden">
                <AppLogoLink markClassName="h-auto w-20" />
              </div>
              <h1 className="hidden md:block text-lg font-semibold text-foreground">
                {activeSection === "sellers" && "Продавцы"}
                {activeSection === "topic_suggestions" && "Предложения новых тем"}
                {activeSection === "reports" && "Жалобы на продукты"}
                {activeSection === "improvements" && "Предложения по улучшению"}
                {activeSection === "support" && "Сообщения"}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={logout}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 px-2.5 sm:px-3 rounded-xl transition-colors"
                title="Выйти"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Выйти</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 py-6 flex-1">
          {activeSection === "sellers" && (
          <div className="space-y-6">
            {/* Переключатель режимов и поиск */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={sellerMode === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSellerMode("all")}
                >
                  <Users className="w-4 h-4 mr-1.5" />
                  Все продавцы ({creators.length})
                </Button>
                <Button
                  variant={sellerMode === "course_creator" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSellerMode("course_creator")}
                >
                  <GraduationCap className="w-4 h-4 mr-1.5" />
                  Курсы и коучинг ({courseCreators.length})
                </Button>
                <Button
                  variant={sellerMode === "online_school" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSellerMode("online_school")}
                >
                  <School className="w-4 h-4 mr-1.5" />
                  Онлайн-школы ({onlineSchools.length})
                </Button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Поиск продавца..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            {/* Карточки статистики */}
            {sellerMode === "all" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Всего продавцов" value={allStats.count} />
                  <StatCard label="Учеников (всего)" value={allStats.students} />
                  <StatCard label="Продуктов" value={allStats.products} />
                  <StatCard label="Общий доход, ₸" value={allStats.revenue.toLocaleString("ru-RU")} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setSellerMode("course_creator")}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-medium">
                          <GraduationCap className="w-5 h-5 text-primary" />
                          <span>Курсы и коучинг</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {courseStats.count} авторов · {courseStats.students} учеников · {courseStats.products} продуктов
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{courseStats.revenue.toLocaleString("ru-RU")} ₸</div>
                        <div className="text-xs text-primary font-medium">Открыть режим →</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setSellerMode("online_school")}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-medium">
                          <School className="w-5 h-5 text-primary" />
                          <span>Онлайн-школы</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {schoolStats.count} школ · {schoolStats.teachers} учителей · {schoolStats.students} учеников
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{schoolStats.revenue.toLocaleString("ru-RU")} ₸</div>
                        <div className="text-xs text-primary font-medium">Открыть режим →</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {sellerMode === "course_creator" && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Авторов курсов" value={courseStats.count} />
                <StatCard label="Учеников курсов" value={courseStats.students} />
                <StatCard label="Продуктов" value={courseStats.products} />
                <StatCard label="Доход с курсов, ₸" value={courseStats.revenue.toLocaleString("ru-RU")} />
                <StatCard label="Средний чек/автор, ₸" value={courseStats.avgRevenue.toLocaleString("ru-RU")} />
              </div>
            )}

            {sellerMode === "online_school" && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Онлайн-школ" value={schoolStats.count} />
                <StatCard label="Учителей в школах" value={schoolStats.teachers} />
                <StatCard label="Учеников школ" value={schoolStats.students} />
                <StatCard label="Продуктов школ" value={schoolStats.products} />
                <StatCard label="Доход школ, ₸" value={schoolStats.revenue.toLocaleString("ru-RU")} />
              </div>
            )}

            {/* Таблица продавцов */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3">Продавец</th>
                        <th className="text-left p-3">Режим</th>
                        {(sellerMode === "all" || sellerMode === "online_school") && (
                          <th className="text-right p-3">Учителей</th>
                        )}
                        <th className="text-right p-3">Учеников</th>
                        <th className="text-right p-3">Продуктов</th>
                        <th className="text-right p-3">Доход, ₸</th>
                        <th className="text-left p-3">Статус</th>
                        <th className="text-right p-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCreators.map((c) => {
                        const isSchool =
                          c.account_type === "online_school" || c.account_type === "school";
                        return (
                          <tr key={c.id} className="border-t hover:bg-muted/30">
                            <td className="p-3">
                              <button
                                type="button"
                                className="text-left hover:underline focus-ring rounded"
                                onClick={() => setSelectedCreator(c)}
                              >
                                <div className="font-medium">{c.display_name}</div>
                                <div className="text-xs text-muted-foreground">@{c.login}</div>
                              </button>
                            </td>
                            <td className="p-3">
                              {isSchool ? (
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-blue-200 text-blue-700 bg-blue-50/50 text-xs"
                                >
                                  <School className="w-3 h-3" /> Онлайн-школа
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-amber-200 text-amber-700 bg-amber-50/50 text-xs"
                                >
                                  <GraduationCap className="w-3 h-3" /> Курсы и коучинг
                                </Badge>
                              )}
                            </td>
                            {(sellerMode === "all" || sellerMode === "online_school") && (
                              <td className="p-3 text-right">
                                {isSchool ? c.teachers_count || 0 : "—"}
                              </td>
                            )}
                            <td className="p-3 text-right font-medium">{c.students_count}</td>
                            <td className="p-3 text-right">{c.products_count}</td>
                            <td className="p-3 text-right font-semibold">
                              {c.revenue.toLocaleString("ru-RU")}
                            </td>
                            <td className="p-3">
                              {c.is_blocked ? (
                                <Badge variant="destructive">Заблокирован</Badge>
                              ) : (
                                <Badge variant="secondary">Активен</Badge>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedCreator(c)}
                                  title="Подробнее"
                                >
                                  <BookOpen className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleBlock(c)}
                                  disabled={busyId === c.id}
                                  title={c.is_blocked ? "Разблокировать" : "Заблокировать"}
                                >
                                  {c.is_blocked ? (
                                    <Unlock className="w-4 h-4" />
                                  ) : (
                                    <Lock className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(c)}
                                  title="Удалить"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredCreators.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-muted-foreground">
                            {searchQuery ? "Ничего не найдено по вашему запросу" : "Продавцов пока нет"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

          {activeSection === "topic_suggestions" && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">Предложения новых тем</h2>
                  {pendingTopicsCount > 0 && (
                    <Badge variant="secondary" className="bg-[#FF6B00]/10 text-[#FF6B00] border-[#FF6B00]/20 font-semibold">
                      🔔 {pendingTopicsCount === 1 ? "1 новая тема" : `${pendingTopicsCount} новых тем`}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Идеи и темы для онлайн-уроков и курсов от пользователей платформы
                </p>
              </div>

              {loadingTopics ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : topicSuggestions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                      <Lightbulb className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-lg">Пока нет предложений</h3>
                    <p className="text-sm text-muted-foreground max-w-md mt-1.5">
                      Когда пользователи предложат темы, которых не хватает в каталоге, они появятся здесь на модерацию.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {topicSuggestions.map((item) => (
                    <Card key={item.id} className="overflow-hidden border border-border/80 shadow-xs hover:border-primary/30 transition-all">
                      <CardContent className="p-5 space-y-4">
                        <div className="space-y-2.5 text-sm">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-medium text-primary">Новая тема</span>
                            <span>
                              {new Date(item.created_at).toLocaleDateString("ru-RU", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          
                          <div className="pt-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>Тема:</span>
                              {editingTopicId !== item.id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTopicId(item.id);
                                    setEditingTopicName(item.name);
                                  }}
                                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
                                  title="Редактировать тему"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Изменить</span>
                                </button>
                              )}
                            </div>

                            {editingTopicId === item.id ? (
                              <div className="space-y-2 pt-0.5">
                                <Input
                                  value={editingTopicName}
                                  onChange={(e) => setEditingTopicName(e.target.value)}
                                  placeholder="Название темы"
                                  className="h-9 text-base bg-background font-medium"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void handleSaveEditedTopic(item.id);
                                    } else if (e.key === "Escape") {
                                      setEditingTopicId(null);
                                    }
                                  }}
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={actionBusyTopicId === item.id}
                                    onClick={() => handleSaveEditedTopic(item.id)}
                                    className="h-7 px-2.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Сохранить</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingTopicId(null)}
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                                  >
                                    Отмена
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-lg font-bold text-foreground">
                                {item.name}
                              </div>
                            )}
                          </div>
                          
                          <div className="pt-2 border-t border-border/60 space-y-1.5 text-xs text-muted-foreground">
                            <div>
                              <span className="font-medium text-foreground/80">Категория: </span>
                              <span className="text-foreground font-medium">{item.category_name || "—"}</span>
                            </div>
                            {item.subcategory_name && (
                              <div>
                                <span className="font-medium text-foreground/80">Подкатегория: </span>
                                <span className="text-foreground">{item.subcategory_name}</span>
                              </div>
                            )}
                            {item.created_by && (
                              <div>
                                <span className="font-medium text-foreground/80">Автор: </span>
                                <span className="text-foreground font-medium">{item.created_by.replace(/^@+/, '')}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                          <Button
                            type="button"
                            size="sm"
                            disabled={actionBusyTopicId === item.id}
                            onClick={() => handleApproveTopic(item.id)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl h-9 text-xs gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Одобрить
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={actionBusyTopicId === item.id}
                            onClick={() => handleRejectTopic(item.id)}
                            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 font-medium rounded-xl h-9 text-xs gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            Отклонить
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "reports" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Жалобы на продукты</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Жалобы пользователей на нарушения, подозрительный или некачественный контент
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 bg-muted/60 p-1 rounded-xl border border-border/60">
                  <Button
                    type="button"
                    variant={reportsFilter === "pending" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setReportsFilter("pending")}
                    className={cn(
                      "h-8 px-3 text-xs rounded-lg font-medium",
                      reportsFilter === "pending" ? "bg-[#FF6B00] hover:bg-[#E86000] text-white shadow-xs" : ""
                    )}
                  >
                    На рассмотрении
                    {pendingReportsCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-bold">
                        {pendingReportsCount}
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant={reportsFilter === "all" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setReportsFilter("all")}
                    className={cn(
                      "h-8 px-3 text-xs rounded-lg font-medium",
                      reportsFilter === "all" ? "bg-[#FF6B00] hover:bg-[#E86000] text-white shadow-xs" : ""
                    )}
                  >
                    Все ({reports.length})
                  </Button>
                  <Button
                    type="button"
                    variant={reportsFilter === "resolved" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setReportsFilter("resolved")}
                    className={cn(
                      "h-8 px-3 text-xs rounded-lg font-medium",
                      reportsFilter === "resolved" ? "bg-[#FF6B00] hover:bg-[#E86000] text-white shadow-xs" : ""
                    )}
                  >
                    Решенные
                  </Button>
                  <Button
                    type="button"
                    variant={reportsFilter === "dismissed" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setReportsFilter("dismissed")}
                    className={cn(
                      "h-8 px-3 text-xs rounded-lg font-medium",
                      reportsFilter === "dismissed" ? "bg-[#FF6B00] hover:bg-[#E86000] text-white shadow-xs" : ""
                    )}
                  >
                    Отклоненные
                  </Button>
                </div>
              </div>

              {loadingReports ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : reports.filter((r) => reportsFilter === "all" || r.status === reportsFilter).length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
                      <Flag className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-lg">
                      {reportsFilter === "pending" ? "Нет новых жалоб" : "В этом разделе пусто"}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mt-1.5">
                      {reportsFilter === "pending"
                        ? "На данный момент все поступившие жалобы рассмотрены."
                        : "Здесь будут отображаться жалобы пользователей по выбранному фильтру."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reports
                    .filter((r) => reportsFilter === "all" || r.status === reportsFilter)
                    .map((item) => (
                      <Card
                        key={item.id}
                        className={cn(
                          "transition-shadow hover:shadow-md border",
                          item.status === "pending" ? "border-amber-200 dark:border-amber-900/40 bg-card" : "bg-card/70 opacity-90"
                        )}
                      >
                        <CardContent className="p-5 space-y-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-xs text-muted-foreground block mb-0.5">
                                {new Date(item.created_at).toLocaleDateString("ru-RU", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <h3 className="font-semibold text-base text-foreground line-clamp-2">
                                {item.products?.title || `Продукт ${item.product_id.slice(0, 8)}`}
                              </h3>
                            </div>
                            <div className="shrink-0">
                              {item.status === "pending" && (
                                <Badge className="bg-[#FF6B00] text-white border-none text-[11px]">
                                  На рассмотрении
                                </Badge>
                              )}
                              {item.status === "resolved" && (
                                <Badge className="bg-emerald-600 text-white border-none text-[11px]">
                                  Решено
                                </Badge>
                              )}
                              {item.status === "dismissed" && (
                                <Badge variant="outline" className="text-muted-foreground text-[11px]">
                                  Отклонено
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 block mb-1">
                              Причина: {item.reason}
                            </span>
                            {item.description ? (
                              <p className="text-xs text-foreground/90 whitespace-pre-wrap">
                                {item.description}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">
                                Подробное описание не указано
                              </p>
                            )}
                          </div>

                          {(item.reporter_name || item.reporter_contact) && (
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                              {item.reporter_name && <span>От: {item.reporter_name}</span>}
                              {item.reporter_contact && <span>Связь: {item.reporter_contact}</span>}
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2 border-t">
                            <a
                              href={`/p/${item.product_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
                            >
                              К продукту
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </a>

                            {item.status === "pending" && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={actionBusyReportId === item.id}
                                  onClick={() => handleUpdateReportStatus(item.id, "resolved")}
                                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg ml-auto"
                                >
                                  <Check className="w-3.5 h-3.5 mr-1" />
                                  Решено
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={actionBusyReportId === item.id}
                                  onClick={() => handleUpdateReportStatus(item.id, "dismissed")}
                                  className="h-8 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 font-medium rounded-lg"
                                >
                                  <X className="w-3.5 h-3.5 mr-1" />
                                  Отклонить
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "improvements" && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">Предложения по улучшению</h2>
                <p className="text-sm text-muted-foreground">
                  Отзывы, пожелания и предложения пользователей по развитию платформы Dostup
                </p>
              </div>
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
                    <MessageSquarePlus className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-lg">Пока предложений нет</h3>
                  <p className="text-sm text-muted-foreground max-w-md mt-1.5">
                    Здесь будут собираться отзывы и идеи пользователей по улучшению интерфейса и возможностей платформы.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === "support" && (
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[70vh] overflow-y-auto divide-y">
                    {threads.length === 0 && (
                      <div className="p-4 text-center text-muted-foreground text-sm">Чатов пока нет</div>
                    )}
                    {threads.map((t) => (
                      <button
                        key={t.id}
                        className={`w-full text-left p-3 hover:bg-muted/50 ${
                          selectedThread?.id === t.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedThread(t)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium truncate">{t.display_name}</div>
                          {t.unread_for_moderator > 0 && (
                            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold bg-[#FF6B00] text-white shadow-xs">
                              {t.unread_for_moderator}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">{t.user_type}</div>
                        {t.last_message_preview && (
                          <div className="text-xs text-muted-foreground truncate mt-1">
                            {t.last_message_preview}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <div>
                {selectedThread ? (
                  <SupportChat
                    key={selectedThread.id}
                    asModerator
                    threadId={selectedThread.id}
                    moderatorToken={token!}
                    userType={selectedThread.user_type as any}
                    userRef={selectedThread.user_ref}
                    displayName={selectedThread.display_name}
                  />
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Выберите чат слева
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Настройки модератора */}
      <ModeratorSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onLogout={logout}
      />

      {/* Модальное окно с детальной статистикой продавца */}
      <Dialog open={!!selectedCreator} onOpenChange={(o) => !o && setSelectedCreator(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedCreator?.display_name}</span>
              {selectedCreator?.account_type === "online_school" ||
              selectedCreator?.account_type === "school" ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-blue-200 text-blue-700 bg-blue-50/50 text-xs"
                >
                  <School className="w-3 h-3" /> Онлайн-школа
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-200 text-amber-700 bg-amber-50/50 text-xs"
                >
                  <GraduationCap className="w-3 h-3" /> Курсы и коучинг
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>@{selectedCreator?.login}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Учеников</div>
              <div className="text-xl font-bold mt-0.5">{selectedCreator?.students_count || 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Продуктов</div>
              <div className="text-xl font-bold mt-0.5">{selectedCreator?.products_count || 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                {selectedCreator?.account_type === "online_school" ||
                selectedCreator?.account_type === "school"
                  ? "Учителей"
                  : "Преподавателей"}
              </div>
              <div className="text-xl font-bold mt-0.5">
                {selectedCreator?.account_type === "online_school" ||
                selectedCreator?.account_type === "school"
                  ? selectedCreator?.teachers_count || 0
                  : 1}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Доход</div>
              <div className="text-xl font-bold mt-0.5 text-primary">
                {(selectedCreator?.revenue || 0).toLocaleString("ru-RU")} ₸
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>
              Регистрация:{" "}
              {selectedCreator?.created_at
                ? new Date(selectedCreator.created_at).toLocaleDateString("ru-RU")
                : "—"}
            </span>
            <a
              href={`/s/${selectedCreator?.login}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              Витрина <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* Модальное окно уведомлений */}
      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Уведомления</DialogTitle>
            <DialogDescription>Системные события и оповещения платформы</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {!pushEnabled ? (
              <div className="p-3 rounded-xl border border-[#FF6B00]/30 bg-[#FF6B00]/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#FF6B00]/15 text-[#FF6B00] flex items-center justify-center font-medium shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Push на телефон</div>
                    <div className="text-[11px] text-muted-foreground">Оповещения при закрытом сайте</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  type="button"
                  onClick={handleEnablePushNotifications}
                  className="h-8 px-3 text-xs bg-[#FF6B00] hover:bg-[#FF6B00]/90 text-white font-medium rounded-lg shrink-0 shadow-xs"
                >
                  Включить
                </Button>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center gap-2 text-xs text-emerald-700 font-medium">
                <Bell className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Push-уведомления на телефон активны</span>
              </div>
            )}

            {pendingTopicsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection("topic_suggestions");
                  setNotificationsOpen(false);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-medium text-base shrink-0">
                    💡
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">
                      {pendingTopicsCount === 1
                        ? "1 новая предложенная тема"
                        : `${pendingTopicsCount} новых предложенных тем`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Нажмите, чтобы открыть предложения тем
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FF6B00] text-white text-[11px] font-bold shadow-xs">
                    {pendingTopicsCount}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )}

            {pendingReportsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection("reports");
                  setNotificationsOpen(false);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-destructive/15 text-destructive flex items-center justify-center font-medium text-base shrink-0">
                    ⚠️
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">
                      {pendingReportsCount === 1
                        ? "1 новая жалоба на продукт"
                        : `${pendingReportsCount} новых жалоб на продукты`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Нажмите, чтобы открыть список жалоб
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FF6B00] text-white text-[11px] font-bold shadow-xs">
                    {pendingReportsCount}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )}

            {unreadChatsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection("support");
                  setNotificationsOpen(false);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center font-medium text-base shrink-0">
                    💬
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">
                      {unreadChatsCount === 1
                        ? "1 чат с новыми сообщениями"
                        : `${unreadChatsCount} чатов с новыми сообщениями`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Нажмите, чтобы открыть диалоги
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FF6B00] text-white text-[11px] font-bold shadow-xs">
                    {unreadChatsCount}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )}

            {pendingTopicsCount === 0 && pendingReportsCount === 0 && unreadChatsCount === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Новых системных уведомлений нет
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить аккаунт навсегда?</AlertDialogTitle>
            <AlertDialogDescription>
              Будут удалены продукты, расписания, материалы, объявления и покупки{" "}
              {deleteTarget?.display_name}. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </CardContent>
  </Card>
);

export default ModeratorDashboard;