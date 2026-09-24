import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { studentCreds, invokeApi } from "@/lib/sessionApi";
import { useLanguage } from "@/contexts/LanguageContext";
import { Bell, Calendar, Clock, User, X, Loader2, Timer, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { useEffect } from "react";
import RejectRescheduleDialog from "@/components/RejectRescheduleDialog";

interface RescheduleRequest {
  id: string;
  booking_id: string;
  simple_user_id: string | null;
  schedule_id: string | null;
  product_id: string;
  product_title: string;
  old_date: string;
  old_time: string;
  new_date: string;
  new_time: string;
  reasons: string[] | null;
  comment: string | null;
  status: string;
  response_comment: string | null;
  responded_at: string | null;
  created_at: string;
  user_name?: string;
}

interface TeacherNotificationsTabProps {
  teacherName: string;
  productIds: string[];
  lastViewedAt: Date | null;
}

const TeacherNotificationsTab = ({ teacherName, productIds, lastViewedAt }: TeacherNotificationsTabProps) => {
  const { language, l } = useLanguage();
  const queryClient = useQueryClient();
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);

  const { data: teacherSchedules = [] } = useQuery({
    queryKey: ["teacher-notification-schedules", teacherName, productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ schedules: { id: string; title: string; product?: { title: string } | null }[] }>("manage-schedules", {
        action: "list_schedules",
        ...studentCreds(),
        productIds,
      });
      return data.schedules ?? [];
    },
    enabled: productIds.length > 0,
  });

  const scheduleIds = teacherSchedules.map(s => s.id);

  // Get bookings for teacher's schedules
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
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
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
    },
    enabled: scheduleIds.length > 0,
  });

  // Get cancellations
  const { data: cancellations = [], isLoading: cancellationsLoading } = useQuery({
    queryKey: ["teacher-notification-cancellations", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ cancellations: { id: string; cancelled_by: string; cancelled_at: string }[] }>("manage-bookings", {
        action: "list_cancellations",
        ...studentCreds(),
        productIds,
      });
      return (data.cancellations ?? []).filter((c) => c.cancelled_by === "student").slice(0, 50);
    },
    enabled: productIds.length > 0,
  });

  // Get reschedule requests for teacher's schedules (pending from students)
  const { data: rescheduleRequests = [], isLoading: rescheduleLoading } = useQuery<RescheduleRequest[]>({
    queryKey: ["teacher-reschedule-requests", scheduleIds],
    queryFn: async () => {
      if (!scheduleIds.length) return [];
      const data = await invokeApi<{ requests: RescheduleRequest[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        scheduleIds,
        status: "pending",
        requestedBy: "student",
      });
      return (data.requests ?? []).slice(0, 50);
    },
    enabled: scheduleIds.length > 0,
  });

  // Get reschedule responses (teacher requested, student approved/rejected)
  const { data: rescheduleResponses = [], isLoading: responsesLoading } = useQuery<RescheduleRequest[]>({
    queryKey: ["teacher-reschedule-responses", scheduleIds],
    queryFn: async () => {
      if (!scheduleIds.length) return [];
      const data = await invokeApi<{ requests: RescheduleRequest[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        scheduleIds,
        requestedBy: "teacher",
      });
      return (data.requests ?? [])
        .filter((r) => r.status === "approved" || r.status === "rejected")
        .sort((a, b) => new Date(b.responded_at || b.created_at || "").getTime() - new Date(a.responded_at || a.created_at || "").getTime())
        .slice(0, 50);
    },
    enabled: scheduleIds.length > 0,
  });

  // Approve reschedule
  const approveReschedule = useMutation({
    mutationFn: async (request: RescheduleRequest) => {
      await invokeApi("manage-bookings", {
        action: "approve_reschedule",
        ...studentCreds(),
        requestId: request.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-reschedule-requests"] });
      toast.success(l({ ru: "Перенос подтверждён", kk: "Ауыстыру расталды", en: "Reschedule confirmed" }));
    },
    onError: () => {
      toast.error(l({ ru: "Ошибка при подтверждении", kk: "Растау қатесі", en: "Could not confirm" }));
    },
  });

  // Reject reschedule
  const rejectReschedule = useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment: string }) => {
      await invokeApi("manage-bookings", {
        action: "reject_reschedule",
        ...studentCreds(),
        requestId,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-reschedule-requests"] });
      setRejectingRequestId(null);
      toast.success(l({ ru: "Запрос отклонён", kk: "Сұраныс қабылданбады", en: "Request rejected" }));
    },
    onError: () => {
      toast.error(l({ ru: "Ошибка", kk: "Қате", en: "Error" }));
    },
  });

  // Realtime for reschedule requests and responses
  useEffect(() => {
    if (!scheduleIds.length) return;
    const channel = supabase
      .channel("teacher-reschedule-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reschedule_requests" },
        (payload) => {
          const newRequest = payload.new as any;
          if (scheduleIds.includes(newRequest.schedule_id)) {
            queryClient.invalidateQueries({ queryKey: ["teacher-reschedule-requests"] });
          }
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reschedule_requests" },
        (payload) => {
          const updated = payload.new as any;
          if (scheduleIds.includes(updated.schedule_id) && updated.requested_by === "teacher" && ["approved", "rejected"].includes(updated.status)) {
            queryClient.invalidateQueries({ queryKey: ["teacher-reschedule-responses"] });
            queryClient.invalidateQueries({ queryKey: ["teacher-reschedule-responses-count"] });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scheduleIds, queryClient]);

  const isLoading = bookingsLoading || cancellationsLoading || rescheduleLoading || responsesLoading;
  const compareDate = lastViewedAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

  const allNotifications = [
    ...bookings.map(b => ({ id: b.id, type: "booking" as const, date: b.created_at, data: b })),
    ...cancellations.map(c => ({ id: c.id, type: "cancellation" as const, date: c.cancelled_at, data: c })),
    ...rescheduleResponses.map(r => ({ id: r.id, type: "reschedule_response" as const, date: r.responded_at || r.created_at || "", data: r })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Bell className="w-5 h-5" />
        {l({ ru: "Уведомления", kk: "Хабарландырулар", en: "Notifications" })}
      </h2>

      {/* Reschedule Requests */}
      {rescheduleRequests.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Timer className="w-4 h-4" />
              {l({ ru: "Запросы на перенос", kk: "Ауыстыру сұраныстары", en: "Reschedule requests" })} ({rescheduleRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rescheduleRequests.map((request) => {
                const isNew = new Date(request.created_at) > compareDate;
                return (
                  <div key={request.id} className={`p-3 transition-colors ${isNew ? "bg-primary/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-1.5 rounded-full flex-shrink-0 bg-primary/10 text-primary">
                          <Timer className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground truncate">{request.user_name}</span>
                            {isNew && <Badge variant="default" className="text-[10px] px-1.5 py-0">{l({ ru: "Новое", kk: "Жаңа", en: "New" })}</Badge>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="pl-8 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {l({ ru: "просит перенести", kk: "ауыстыруды сұрайды", en: "asks to reschedule" })}: <span className="font-medium text-foreground">{request.product_title}</span>
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-orange-500">{request.old_time?.slice(0, 5)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium text-orange-500">{request.new_time?.slice(0, 5)}</span>
                      </div>
                      {((request.reasons && request.reasons.length > 0) || request.comment) && (
                        <div className="p-2 bg-muted/50 rounded text-xs">
                          {request.reasons && request.reasons.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {request.reasons.map((reason, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">{reason}</Badge>
                              ))}
                            </div>
                          )}
                          {request.comment && <p className="text-muted-foreground mt-1 italic">"{request.comment}"</p>}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" onClick={() => approveReschedule.mutate(request)} disabled={approveReschedule.isPending || rejectReschedule.isPending} className="h-7 text-xs px-2">
                          {approveReschedule.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" />{l({ ru: "Подтвердить", kk: "Растау", en: "Confirm" })}</>}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectingRequestId(request.id)} disabled={approveReschedule.isPending || rejectReschedule.isPending} className="h-7 text-xs px-2 text-destructive border-destructive/30">
                          {rejectReschedule.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><X className="w-3.5 h-3.5 mr-1" />{l({ ru: "Отклонить", kk: "Қабылдамау", en: "Reject" })}</>}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {allNotifications.length === 0 && rescheduleRequests.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{l({ ru: "Уведомлений пока нет", kk: "Хабарландырулар әзірше жоқ", en: "No notifications yet" })}</p>
          <p className="text-sm text-muted-foreground mt-1">{l({ ru: "Здесь будут появляться записи и отмены", kk: "Мұнда жазбалар мен бас тартулар пайда болады", en: "Bookings and cancellations will appear here" })}</p>
        </div>
      ) : (
        <div className="space-y-2">
        {allNotifications.map((notification) => {
          const isNew = new Date(notification.date) > compareDate;
          
          if (notification.type === "booking") {
            const booking = notification.data as any;
            return (
              <Card key={`booking-${notification.id}`} className={isNew ? "border-primary/50 bg-primary/5" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{booking.user?.name || "—"}</p>
                        {isNew && <Badge variant="default" className="text-xs px-2 py-0.5">{l({ ru: "Новое", kk: "Жаңа", en: "New" })}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {l({ ru: "записался на", kk: "жазылды", en: "booked" })} {booking.schedule?.product?.title || booking.schedule?.title}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{booking.time_slot?.date && format(parseISO(booking.time_slot.date), "d MMM", { locale: ru })}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{booking.time_slot?.start_time?.slice(0, 5)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          } else if (notification.type === "cancellation") {
            const cancellation = notification.data as any;
            return (
              <Card key={`cancel-${notification.id}`} className={isNew ? "border-destructive/50 bg-destructive/5" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <X className="w-5 h-5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{cancellation.user_name}</p>
                        {isNew && <Badge variant="destructive" className="text-xs px-2 py-0.5">{l({ ru: "Новое", kk: "Жаңа", en: "New" })}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {l({ ru: "отменил запись на", kk: "жазбасын бас тартты", en: "cancelled their booking of" })} {cancellation.product_title}
                      </p>
                      {((cancellation.cancellation_reasons?.length > 0) || cancellation.cancellation_comment) && (
                        <div className="mt-2 p-2 bg-destructive/5 rounded">
                          {cancellation.cancellation_reasons?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {cancellation.cancellation_reasons.map((reason: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0.5 border-destructive/30 text-destructive">{reason}</Badge>
                              ))}
                            </div>
                          )}
                          {cancellation.cancellation_comment && <p className="text-xs text-muted-foreground mt-1.5 italic">"{cancellation.cancellation_comment}"</p>}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{cancellation.slot_date && format(parseISO(cancellation.slot_date), "d MMM", { locale: ru })}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{cancellation.slot_time?.slice(0, 5)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          } else if (notification.type === "reschedule_response") {
            const response = notification.data as RescheduleRequest;
            const isApproved = response.status === "approved";
            return (
              <Card key={`reschedule-resp-${notification.id}`} className={isNew ? (isApproved ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20" : "border-destructive/50 bg-destructive/5") : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isApproved ? "bg-green-100 dark:bg-green-900/30" : "bg-destructive/10"}`}>
                      {isApproved ? <Check className="w-5 h-5 text-green-600" /> : <X className="w-5 h-5 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {isApproved
                            ? (l({ ru: "Перенос подтверждён", kk: "Ауыстыру расталды", en: "Reschedule confirmed" }))
                            : (l({ ru: "Перенос отклонён", kk: "Ауыстыру қабылданбады", en: "Reschedule rejected" }))}
                        </p>
                        {isNew && <Badge variant={isApproved ? "default" : "destructive"} className="text-xs px-2 py-0.5">{l({ ru: "Новое", kk: "Жаңа", en: "New" })}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{response.product_title}</p>
                      <div className="flex items-center gap-2 text-xs mt-1">
                        <span className="font-medium text-orange-500">{response.old_time?.slice(0, 5)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium text-orange-500">{response.new_time?.slice(0, 5)}</span>
                      </div>
                      {response.response_comment && (
                        <div className="mt-2 p-2 bg-muted/50 rounded">
                          <p className="text-xs text-muted-foreground italic">"{response.response_comment}"</p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {response.user_name} {isApproved ? (l({ ru: "подтвердил", kk: "растады", en: "confirmed" })) : (l({ ru: "отклонил", kk: "қабылдамады", en: "rejected" }))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }
          return null;
        })}
        </div>
      )}
      <RejectRescheduleDialog
        isOpen={!!rejectingRequestId}
        onClose={() => setRejectingRequestId(null)}
        onConfirm={(comment) => {
          if (rejectingRequestId) {
            rejectReschedule.mutate({ requestId: rejectingRequestId, comment });
          }
        }}
        isPending={rejectReschedule.isPending}
      />
    </div>
  );
};

export default TeacherNotificationsTab;
