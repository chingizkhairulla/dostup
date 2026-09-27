import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Calendar, Clock, X, Check, Loader2, XCircle, Timer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCreatorProducts } from "@/hooks/useProducts";
import { useCreatorSimpleBookings } from "@/hooks/useSimplePurchases";
import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { ru, kk } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";
import CreatorPendingPayments, { useCreatorPendingPurchases } from "@/components/creator/CreatorPendingPayments";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import CancellationReasonDialog from "@/components/CancellationReasonDialog";
import RejectRescheduleDialog from "@/components/RejectRescheduleDialog";

interface BookingCancellation {
  id: string;
  user_name: string;
  product_title: string;
  product_id: string;
  schedule_id: string | null;
  schedule_title: string | null;
  slot_date: string;
  slot_time: string;
  cancelled_at: string;
  cancelled_by: string;
  cancellation_reasons: string[] | null;
  cancellation_comment: string | null;
}

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
  created_at: string;
  responded_at: string | null;
  user_name?: string;
}

interface CreatorNotificationsTabProps {
  creatorName: string;
  lastViewedAt?: Date | null;
  onOpenUsers?: () => void;
}

const CreatorNotificationsTab = ({ creatorName, lastViewedAt, onOpenUsers }: CreatorNotificationsTabProps) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const { data: products } = useCreatorProducts(creatorName);
  const productIds = useMemo(() => products?.map(p => p.id) || [], [products]);
  const { data: bookings, isLoading: bookingsLoading } = useCreatorSimpleBookings(productIds);
  const cancelBooking = useMutation({
    mutationFn: async ({ bookingId, cancelledBy, reasons, comment }: {
      bookingId: string;
      cancelledBy: "creator" | "teacher";
      reasons?: string[];
      comment?: string;
    }) => {
      await invokeApi("manage-bookings", {
        action: "cancel",
        ...creatorCreds(),
        bookingId,
        cancelledBy,
        reasons,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-simple-bookings"] });
    },
  });
  
  // State for cancellation dialog
  const [cancelingBooking, setCancelingBooking] = useState<{
    id: string;
    userName: string;
    productTitle: string;
    slotDate?: string;
    slotTime?: string;
  } | null>(null);

  // State for reject reschedule dialog
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);

  const dateLocale = language === "kk" ? kk : ru;

  // Получить ID расписаний автора (без teacher_id)
  const { data: authorScheduleIds = [] } = useQuery({
    queryKey: ["creator-author-schedule-ids", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ schedules: { id: string; title: string }[] }>("manage-schedules", {
        action: "list_schedules",
        ...creatorCreds(),
        productIds,
        creatorOnly: true,
      });
      return (data.schedules ?? []).map((s) => s.id);
    },
    enabled: productIds.length > 0,
  });

  // Получить отменённые записи - только для расписаний автора
  const { data: cancellations = [], isLoading: cancellationsLoading } = useQuery<BookingCancellation[]>({
    queryKey: ["creator-cancellations", productIds, authorScheduleIds],
    queryFn: async () => {
      if (!productIds.length || !authorScheduleIds.length) return [];

      const data = await invokeApi<{ cancellations: BookingCancellation[] }>("manage-bookings", {
        action: "list_cancellations",
        ...creatorCreds(),
        productIds,
      });
      const allCancellations = (data.cancellations ?? []).filter((c) => c.cancelled_by === "student");
      if (!allCancellations.length) return [];

      const schedulesData = await invokeApi<{ schedules: { id: string; title: string }[] }>("manage-schedules", {
        action: "list_schedules",
        ...creatorCreds(),
        productIds,
        creatorOnly: true,
      });
      const authorScheduleTitles = new Set((schedulesData.schedules ?? []).map((s) => s.title));

      const filtered = allCancellations.filter(c => {
        if (c.schedule_id) {
          return authorScheduleIds.includes(c.schedule_id);
        }
        return c.schedule_title && authorScheduleTitles.has(c.schedule_title);
      });

      return (filtered.slice(0, 50) || []) as BookingCancellation[];
    },
    enabled: productIds.length > 0 && authorScheduleIds.length > 0,
  });

  // Получить запросы на перенос от учеников
  const { data: rescheduleRequests = [], isLoading: rescheduleLoading } = useQuery<RescheduleRequest[]>({
    queryKey: ["creator-reschedule-requests", productIds, authorScheduleIds],
    queryFn: async () => {
      if (!productIds.length) return [];

      const data = await invokeApi<{ requests: RescheduleRequest[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...creatorCreds(),
        productIds,
        status: "pending",
        requestedBy: "student",
      });
      const requests = data.requests ?? [];
      if (!requests.length) return [];

      const filtered = requests.filter((r) => {
        if (r.schedule_id) return authorScheduleIds.includes(r.schedule_id);
        return true;
      });

      return filtered.slice(0, 50);
    },
    enabled: productIds.length > 0,
  });

  // Мутации для подтверждения/отклонения запросов на перенос
  const approveReschedule = useMutation({
    mutationFn: async (request: RescheduleRequest) => {
      await invokeApi("manage-bookings", {
        action: "approve_reschedule",
        ...creatorCreds(),
        requestId: request.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests"] });
      toast.success(language === "ru" ? "Перенос подтверждён" : "Ауыстыру расталды");
    },
    onError: () => {
      toast.error(language === "ru" ? "Ошибка при подтверждении" : "Растау қатесі");
    },
  });

  const rejectReschedule = useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment: string }) => {
      await invokeApi("manage-bookings", {
        action: "reject_reschedule",
        ...creatorCreds(),
        requestId,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests"] });
      setRejectingRequestId(null);
      toast.success(language === "ru" ? "Запрос отклонён" : "Сұраныс қабылданбады");
    },
    onError: () => {
      toast.error(language === "ru" ? "Ошибка" : "Қате");
    },
  });

  // Realtime for reschedule requests
  useEffect(() => {
    if (!productIds.length) return;

    const channel = supabase
      .channel("creator-reschedule-requests-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reschedule_requests" },
        (payload) => {
          const newRequest = payload.new as any;
          if (productIds.includes(newRequest.product_id)) {
            queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests"] });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [productIds, queryClient]);

  // ВАЖНО: только для расписаний автора (где teacher_id = null)
  useEffect(() => {
    if (!productIds.length || !authorScheduleIds.length) return;

    const channel = supabase
      .channel("creator-cancellations-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_cancellations",
        },
        (payload) => {
          const newCancellation = payload.new as BookingCancellation;
          
          // Проверяем: отмена должна быть от студента И для расписания автора
          if (newCancellation.cancelled_by !== "student") {
            console.log("Cancellation not by student, ignoring for creator");
            return;
          }
          
          // Проверяем что schedule_id принадлежит автору (не учителю)
          if (newCancellation.schedule_id && !authorScheduleIds.includes(newCancellation.schedule_id)) {
            console.log("Cancellation is for teacher's schedule, not notifying creator");
            return;
          }
          
          // Только если это расписание автора - обновляем
          queryClient.invalidateQueries({ queryKey: ["creator-cancellations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [productIds, authorScheduleIds, queryClient]);

  const { data: pendingPurchases = [], isLoading: purchasesLoading } = useCreatorPendingPurchases(creatorName);

  // Realtime подписка для обновления pending purchases
  useEffect(() => {
    if (!productIds.length) return;

    const channel = supabase
      .channel("creator-purchases-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "simple_purchases",
        },
        (payload) => {
          const newPurchase = payload.new as { product_id: string };
          
          // Проверяем что покупка для нашего продукта
          if (productIds.includes(newPurchase.product_id)) {
            console.log("[CreatorNotifications] New purchase detected, refreshing...");
            queryClient.invalidateQueries({ queryKey: ["creator-pending-purchases"] });
            queryClient.invalidateQueries({ queryKey: ["creator-pending-purchases-count"] });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "simple_purchases",
        },
        (payload) => {
          const updatedPurchase = payload.new as { product_id: string };
          
          if (productIds.includes(updatedPurchase.product_id)) {
            queryClient.invalidateQueries({ queryKey: ["creator-pending-purchases"] });
            queryClient.invalidateQueries({ queryKey: ["creator-pending-purchases-count"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [productIds, queryClient]);

  const handleCancelBookingWithReason = async (reasons: string[], comment: string) => {
    if (!cancelingBooking) return;
    try {
      await cancelBooking.mutateAsync({ 
        bookingId: cancelingBooking.id, 
        cancelledBy: "creator",
        reasons,
        comment,
      });
      toast.success(t("bookingCancelledCreator"));
      setCancelingBooking(null);
    } catch {
      toast.error(t("cancelFailed"));
    }
  };

  // Sort bookings by created_at (newest first)
  const sortedBookings = useMemo(() => {
    if (!bookings) return [];
    return [...bookings].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [bookings]);

  // Check if item is new - use lastViewedAt if available, otherwise 24 hours
  const isNew = (createdAt: string) => {
    const created = new Date(createdAt);
    if (lastViewedAt) {
      return created > lastViewedAt;
    }
    // Fallback: show as new if within last 24 hours
    const now = new Date();
    return differenceInHours(now, created) <= 24;
  };

  // Get time ago string
  const getTimeAgo = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const minutesAgo = differenceInMinutes(now, created);
    const hoursAgo = differenceInHours(now, created);
    
    if (minutesAgo < 1) return language === "ru" ? "только что" : "дәл қазір";
    if (minutesAgo < 60) return language === "ru" ? `${minutesAgo} мин назад` : `${minutesAgo} мин бұрын`;
    if (hoursAgo < 24) return language === "ru" ? `${hoursAgo} ч назад` : `${hoursAgo} сағ бұрын`;
    
    const daysAgo = Math.floor(hoursAgo / 24);
    if (daysAgo === 1) return language === "ru" ? "вчера" : "кеше";
    if (daysAgo < 7) return language === "ru" ? `${daysAgo} дн назад` : `${daysAgo} күн бұрын`;
    
    return format(created, "d MMM", { locale: dateLocale });
  };

  const isLoading = bookingsLoading || purchasesLoading || cancellationsLoading || rescheduleLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const hasNotifications = sortedBookings.length > 0 || pendingPurchases.length > 0 || cancellations.length > 0 || rescheduleRequests.length > 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{t("notifications")}</h2>
      <CreatorPendingPayments creatorName={creatorName} mode="link" onOpenUsers={onOpenUsers} />

      {/* Reschedule Requests Section */}
      {rescheduleRequests.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Timer className="w-4 h-4" />
              {language === "ru" ? "Запросы на перенос" : "Ауыстыру сұраныстары"} ({rescheduleRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rescheduleRequests.map((request) => {
                const isNewRequest = isNew(request.created_at);
                return (
                  <div key={request.id} className={`p-3 transition-colors ${isNewRequest ? "bg-primary/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-1.5 rounded-full flex-shrink-0 bg-primary/10 text-primary">
                          <Timer className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground truncate">
                              {request.user_name}
                            </span>
                            {isNewRequest && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                {t("new")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {getTimeAgo(request.created_at)}
                      </span>
                    </div>
                    
                    <div className="pl-8 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {language === "ru" ? "просит перенести" : "ауыстыруды сұрайды"}: <span className="font-medium text-foreground">{request.product_title}</span>
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-orange-500">
                          {request.old_time?.slice(0, 5)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium text-orange-500">
                          {request.new_time?.slice(0, 5)}
                        </span>
                      </div>

                      {((request.reasons && request.reasons.length > 0) || request.comment) && (
                        <div className="p-2 bg-muted/50 rounded text-xs">
                          {request.reasons && request.reasons.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {request.reasons.map((reason, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {request.comment && (
                            <p className="text-muted-foreground mt-1 italic">"{request.comment}"</p>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          onClick={() => approveReschedule.mutate(request)}
                          disabled={approveReschedule.isPending || rejectReschedule.isPending}
                          className="h-7 text-xs px-2"
                        >
                          {approveReschedule.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5 mr-1" />
                              {language === "ru" ? "Подтвердить" : "Растау"}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectingRequestId(request.id)}
                          disabled={approveReschedule.isPending || rejectReschedule.isPending}
                          className="h-7 text-xs px-2 text-destructive border-destructive/30"
                        >
                          {rejectReschedule.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <X className="w-3.5 h-3.5 mr-1" />
                              {language === "ru" ? "Отклонить" : "Қабылдамау"}
                            </>
                          )}
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

      {/* Bookings Section */}
      {sortedBookings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5" />
              {t("notifications")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {sortedBookings.map((booking) => {
                const isNewBooking = isNew(booking.created_at);
                const timeSlot = booking.time_slot;
                const schedule = booking.schedule;
                const product = booking.product;
                const user = booking.user;

                return (
                  <div 
                    key={booking.id} 
                    className={`p-3 transition-colors ${isNewBooking ? "bg-primary/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full flex-shrink-0 ${isNewBooking ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Bell className="w-4 h-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">
                            {user?.name || t("student")}
                          </span>
                          <span className="text-muted-foreground">
                            {t("bookedSession")}
                          </span>
                          {isNewBooking && (
                            <Badge variant="default" className="text-xs">
                              {t("new")}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {product?.title || schedule?.title}
                        </p>
                        
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          {timeSlot && (
                            <>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>
                                  {format(new Date(timeSlot.date), "d MMM", { locale: dateLocale })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>
                                  {timeSlot.start_time?.slice(0, 5)}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {getTimeAgo(booking.created_at)}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setCancelingBooking({
                            id: booking.id,
                            userName: user?.name || t("student"),
                            productTitle: product?.title || schedule?.title || "",
                            slotDate: timeSlot?.date,
                            slotTime: timeSlot?.start_time,
                          })}
                        >
                          <X className="w-3.5 h-3.5" />
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

      {/* Cancellations Section */}
      {cancellations.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              {t("cancelledBookings")} ({cancellations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {cancellations.map((cancellation) => {
                const isNewCancellation = isNew(cancellation.cancelled_at);

                return (
                  <div 
                    key={cancellation.id} 
                    className={`p-3 transition-colors ${isNewCancellation ? "bg-destructive/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full flex-shrink-0 bg-destructive/10 text-destructive">
                        <XCircle className="w-4 h-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            {cancellation.user_name || t("student")}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {t("cancelledSession")}
                          </span>
                          {isNewCancellation && (
                            <Badge variant="destructive" className="text-xs px-2 py-0.5">
                              {t("new")}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                          {cancellation.product_title}
                        </p>
                        
                        {/* Причины отмены или комментарий */}
                        {((cancellation.cancellation_reasons && cancellation.cancellation_reasons.length > 0) || cancellation.cancellation_comment) && (
                          <div className="mt-2 p-2.5 bg-destructive/5 rounded-md">
                            {cancellation.cancellation_reasons && cancellation.cancellation_reasons.length > 0 && (
                              <>
                                <p className="text-sm font-medium text-destructive mb-1.5">
                                  {language === "ru" ? "Причины:" : "Себептері:"}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {cancellation.cancellation_reasons.map((reason, idx) => (
                                    <Badge key={idx} variant="outline" className="text-sm px-2 py-0.5 border-destructive/30 text-destructive">
                                      {reason}
                                    </Badge>
                                  ))}
                                </div>
                              </>
                            )}
                            {cancellation.cancellation_comment && (
                              <p className="text-sm text-muted-foreground mt-2 italic">
                                "{cancellation.cancellation_comment}"
                              </p>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 mt-2.5 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {format(new Date(cancellation.slot_date), "d MMM", { locale: dateLocale })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>
                              {cancellation.slot_time?.slice(0, 5)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-sm text-muted-foreground whitespace-nowrap">
                        {getTimeAgo(cancellation.cancelled_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancellation Reason Dialog */}
      <CancellationReasonDialog
        isOpen={!!cancelingBooking}
        onClose={() => setCancelingBooking(null)}
        onConfirm={handleCancelBookingWithReason}
        isPending={cancelBooking.isPending}
        title={language === "ru" ? "Отменить запись?" : "Жазбаны бас тарту керек пе?"}
        description={language === "ru"
          ? `Вы отменяете запись ученика "${cancelingBooking?.userName || "—"}". Укажите причину.`
          : `"${cancelingBooking?.userName || "—"}" оқушысының жазбасын бас тартасыз. Себебін көрсетіңіз.`}
      />
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
      {/* Empty state if no notifications */}
      {!hasNotifications && (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("noNotifications")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("notificationsWillAppear")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CreatorNotificationsTab;
