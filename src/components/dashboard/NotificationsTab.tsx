import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Calendar, Clock, CheckCircle, Unlock, XCircle, ArrowRightLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { studentCreds, invokeApi } from "@/lib/sessionApi";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { format, formatDistanceToNow } from "date-fns";
import { ru, kk } from "date-fns/locale";

interface BookingCancellation {
  id: string;
  booking_id: string;
  product_title: string;
  schedule_title: string | null;
  slot_date: string;
  slot_time: string;
  cancelled_at: string;
  cancelled_by: string;
  cancellation_reasons: string[] | null;
  cancellation_comment: string | null;
}

interface ConfirmedPurchase {
  id: string;
  product_id: string;
  confirmed_at: string;
  product_title: string;
}

interface MaterialUnlock {
  id: string;
  material_title: string;
  product_title: string;
  product_id: string;
  unlocked_at: string;
}

interface RejectedReschedule {
  id: string;
  product_title: string;
  old_date: string;
  old_time: string;
  new_date: string;
  new_time: string;
  response_comment: string | null;
  responded_at: string;
}

interface IncomingReschedule {
  id: string;
  product_title: string;
  old_date: string;
  old_time: string;
  new_date: string;
  new_time: string;
  comment: string | null;
  reasons: string[] | null;
  requested_by: string;
  created_at: string;
}

interface NotificationsTabProps {
  lastViewedAt?: Date | null;
  purchasedProductIds?: string[];
}

const NotificationsTab = ({ lastViewedAt, purchasedProductIds = [] }: NotificationsTabProps) => {
  const { t, language } = useLanguage();
  const { user } = useSimpleAuth();
  const queryClient = useQueryClient();

  // Получить отменённые записи
  const { data: cancellations = [], isLoading: loadingCancellations } = useQuery({
    queryKey: ["student-cancellations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ cancellations: BookingCancellation[] }>("manage-bookings", {
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

  // Получить подтверждённые покупки
  const { data: confirmedPurchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["student-confirmed-purchases", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ purchases: {
        id: string;
        product_id: string;
        created_at?: string;
        confirmed_at?: string | null;
        product?: { title?: string } | null;
      }[] }>("checkout", {
        action: "list_my_purchases",
        ...studentCreds(),
        status: "completed",
      });
      return (data.purchases ?? [])
        .map((p) => ({
          id: p.id,
          product_id: p.product_id,
          confirmed_at: p.confirmed_at || p.created_at || "",
          product_title: p.product?.title || "",
        }))
        .filter((p) => !!p.confirmed_at)
        .sort((a, b) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime())
        .slice(0, 50) as ConfirmedPurchase[];
    },
    enabled: !!user?.id,
  });

  // Получить разблокированные материалы
  const { data: materialUnlocks = [], isLoading: loadingUnlocks } = useQuery({
    queryKey: ["student-material-unlocks", purchasedProductIds],
    queryFn: async () => {
      if (purchasedProductIds.length === 0) return [];
      const data = await invokeApi<{ unlocks: MaterialUnlock[] }>("manage-materials", {
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

  // Получить отклонённые запросы на перенос
  const { data: rejectedReschedules = [], isLoading: loadingRejected } = useQuery({
    queryKey: ["student-rejected-reschedules", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ requests: RejectedReschedule[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        status: "rejected",
      });
      return (data.requests ?? [])
        .sort((a, b) => new Date(b.responded_at).getTime() - new Date(a.responded_at).getTime())
        .slice(0, 50);
    },
    enabled: !!user?.id,
  });

  // Получить входящие запросы на перенос от автора/учителя
  const { data: incomingReschedules = [], isLoading: loadingIncoming } = useQuery({
    queryKey: ["student-incoming-reschedules", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await invokeApi<{ requests: IncomingReschedule[] }>("manage-bookings", {
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

  // Realtime для обновления
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("student-notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_cancellations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["student-cancellations"] });
          queryClient.invalidateQueries({ queryKey: ["student-cancellations-count"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "simple_purchases" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["student-confirmed-purchases"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "material_unlocks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["student-material-unlocks"] });
          queryClient.invalidateQueries({ queryKey: ["student-material-unlocks-count"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reschedule_requests" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["student-rejected-reschedules"] });
          queryClient.invalidateQueries({ queryKey: ["student-rejected-reschedules-count"] });
          queryClient.invalidateQueries({ queryKey: ["student-incoming-reschedules"] });
          queryClient.invalidateQueries({ queryKey: ["student-incoming-reschedules-count"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const isNew = (dateStr: string) => {
    if (!lastViewedAt) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return new Date(dateStr) > dayAgo;
    }
    return new Date(dateStr) > lastViewedAt;
  };

  const locale = language === "ru" ? ru : kk;

  const isLoading = loadingCancellations || loadingPurchases || loadingUnlocks || loadingRejected || loadingIncoming;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Merge all notifications into a single timeline
  type NotificationItem = 
    | { type: "cancellation"; date: string; data: BookingCancellation }
    | { type: "purchase_confirmed"; date: string; data: ConfirmedPurchase }
    | { type: "material_unlock"; date: string; data: MaterialUnlock }
    | { type: "reschedule_rejected"; date: string; data: RejectedReschedule }
    | { type: "incoming_reschedule"; date: string; data: IncomingReschedule };

  const allNotifications: NotificationItem[] = [
    ...cancellations.map(c => ({ type: "cancellation" as const, date: c.cancelled_at, data: c })),
    ...confirmedPurchases.map(p => ({ type: "purchase_confirmed" as const, date: p.confirmed_at, data: p })),
    ...materialUnlocks.map(u => ({ type: "material_unlock" as const, date: u.unlocked_at, data: u })),
    ...rejectedReschedules.map(r => ({ type: "reschedule_rejected" as const, date: r.responded_at, data: r })),
    ...incomingReschedules.map(r => ({ type: "incoming_reschedule" as const, date: r.created_at, data: r })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const hasNotifications = allNotifications.length > 0;

  return (
    <div className="space-y-4">
      {!hasNotifications ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">{t("noStudentNotifications")}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {t("studentNotificationsWillAppear")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allNotifications.map((item) => {
            if (item.type === "material_unlock") {
              const unlock = item.data as MaterialUnlock;
              return (
                <Card key={`unlock-${unlock.id}`} className="relative overflow-hidden">
                  {isNew(unlock.unlocked_at) && (
                    <div className="absolute top-0 right-0">
                      <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground text-xs px-2 py-1">
                        {t("new")}
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <Unlock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-foreground">
                          {language === "ru" ? "Материал доступен" : "Материал қолжетімді"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {unlock.material_title} • {unlock.product_title}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(unlock.unlocked_at), {
                              addSuffix: true,
                              locale,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            if (item.type === "purchase_confirmed") {
              const purchase = item.data as ConfirmedPurchase;
              return (
                <Card key={`purchase-${purchase.id}`} className="relative overflow-hidden">
                  {isNew(purchase.confirmed_at) && (
                    <div className="absolute top-0 right-0">
                      <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground text-xs px-2 py-1">
                        {t("new")}
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-foreground">
                          {language === "ru" ? "Оплата подтверждена" : "Төлем расталды"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {purchase.product_title}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(purchase.confirmed_at), {
                              addSuffix: true,
                              locale,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            if (item.type === "reschedule_rejected") {
              const rejection = item.data as RejectedReschedule;
              return (
                <Card key={`reject-${rejection.id}`} className="relative overflow-hidden">
                  {isNew(rejection.responded_at) && (
                    <div className="absolute top-0 right-0">
                      <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground text-xs px-2 py-1">
                        {t("new")}
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                        <XCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-foreground">
                          {language === "ru" ? "Перенос отклонён" : "Ауыстыру қабылданбады"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {rejection.product_title}
                        </p>
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <span className="font-medium text-orange-500">{rejection.old_time?.slice(0, 5)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium text-orange-500">{rejection.new_time?.slice(0, 5)}</span>
                        </div>
                        {rejection.response_comment && (
                          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                            <p className="text-sm text-muted-foreground italic">
                              "{rejection.response_comment}"
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(rejection.responded_at), {
                              addSuffix: true,
                              locale,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            if (item.type === "incoming_reschedule") {
              const reschedule = item.data as IncomingReschedule;
              return (
                <Card key={`incoming-${reschedule.id}`} className="relative overflow-hidden">
                  {isNew(reschedule.created_at) && (
                    <div className="absolute top-0 right-0">
                      <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground text-xs px-2 py-1">
                        {t("new")}
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                        <ArrowRightLeft className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-foreground">
                          {reschedule.requested_by === "teacher"
                            ? (language === "ru" ? "Запрос на перенос от учителя" : "Мұғалімнен ауыстыру сұрауы")
                            : (language === "ru" ? "Запрос на перенос от автора" : "Автордан ауыстыру сұрауы")}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {reschedule.product_title}
                        </p>
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(reschedule.old_date), "d MMM", { locale })}
                          </span>
                          <span className="font-medium text-orange-500">{reschedule.old_time?.slice(0, 5)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(reschedule.new_date), "d MMM", { locale })}
                          </span>
                          <span className="font-medium text-orange-500">{reschedule.new_time?.slice(0, 5)}</span>
                        </div>
                        {reschedule.comment && (
                          <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded-md">
                            <p className="text-sm text-muted-foreground italic">
                              "{reschedule.comment}"
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(reschedule.created_at), {
                              addSuffix: true,
                              locale,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            const cancellation = item.data as BookingCancellation;
            return (
              <Card key={`cancel-${cancellation.id}`} className="relative overflow-hidden">
                {isNew(cancellation.cancelled_at) && (
                  <div className="absolute top-0 right-0">
                    <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground text-xs px-2 py-1">
                      {t("new")}
                    </Badge>
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-foreground">
                        {cancellation.cancelled_by === "teacher"
                          ? (language === "ru" ? "Запись отменена учителем" : "Мұғалім жазылуды болдырмады")
                          : (language === "ru" ? "Запись отменена автором" : "Автор жазылуды болдырмады")}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {cancellation.product_title}
                        {cancellation.schedule_title && ` • ${cancellation.schedule_title}`}
                      </p>
                      
                      {((cancellation.cancellation_reasons && cancellation.cancellation_reasons.length > 0) || cancellation.cancellation_comment) && (
                        <div className="mt-2 p-2 bg-destructive/5 rounded-md">
                          {cancellation.cancellation_reasons && cancellation.cancellation_reasons.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {cancellation.cancellation_reasons.map((reason: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs px-2 py-0.5 border-destructive/30 text-destructive">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {cancellation.cancellation_comment && (
                            <p className="text-sm text-muted-foreground mt-1.5 italic">
                              "{cancellation.cancellation_comment}"
                            </p>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(cancellation.slot_date), "d MMM", { locale })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {cancellation.slot_time?.slice(0, 5)}
                        </span>
                        <span>
                          {formatDistanceToNow(new Date(cancellation.cancelled_at), {
                            addSuffix: true,
                            locale,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NotificationsTab;
