import { useState, useMemo, useEffect } from "react";
import { useSimplePurchases, useSimpleSchedules, useSimpleTimeSlots, useSimpleBookings, useCreateSimpleBooking, useCancelSimpleBooking, useAllBookingsForSchedule } from "@/hooks/useSimplePurchases";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimezone } from "@/contexts/TimezoneContext";
import { Calendar, Clock, Users, User, Check, Loader2, X, CalendarCheck, GraduationCap, Link as LinkIcon, Copy, Timer, Video } from "lucide-react";
import { format, addDays, isSameDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { studentCreds, invokeApi } from "@/lib/sessionApi";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import CancellationReasonDialog from "@/components/CancellationReasonDialog";
import StudentRescheduleDialog from "@/components/StudentRescheduleDialog";
import RejectRescheduleDialog from "@/components/RejectRescheduleDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Teacher {
  id: string;
  name: string;
}

const ScheduleTab = () => {
  const { data: purchases, isLoading: purchasesLoading } = useSimplePurchases();
  const { data: schedules, isLoading: schedulesLoading } = useSimpleSchedules();
  const { data: bookings, isLoading: bookingsLoading } = useSimpleBookings();
  const { t, language } = useLanguage();
  const { timezone, formatSlotTime, convertSlotToUser } = useTimezone();
  const { user } = useSimpleAuth();
  const createBooking = useCreateSimpleBooking();
  const cancelBooking = useCancelSimpleBooking();
  const queryClient = useQueryClient();

  const cancelRescheduleRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await invokeApi("manage-bookings", {
        action: "cancel_reschedule_request",
        ...studentCreds(),
        requestId,
      });
    },
    onSuccess: () => {
      toast.success(language === "ru" ? "Запрос отменён" : "Сұраныс болдырмалды");
      queryClient.invalidateQueries({ queryKey: ["student-pending-reschedules"] });
    },
  });

  const { data: pendingReschedules = [] } = useQuery({
    queryKey: ["student-pending-reschedules", user?.id],
    queryFn: async () => {
      const data = await invokeApi<{ requests: any[] }>("manage-bookings", {
        action: "list_reschedule_requests",
        ...studentCreds(),
        status: "pending",
      });
      return data.requests ?? [];
    },
    enabled: !!user?.id,
  });
  
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookingToCancel, setBookingToCancel] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [canChooseTeacher, setCanChooseTeacher] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<{
    id: string;
    productTitle: string;
    productId: string;
    scheduleId: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  // Approve reschedule request from creator/teacher
  const approveIncomingReschedule = useMutation({
    mutationFn: async (request: any) => {
      await invokeApi("manage-bookings", {
        action: "approve_reschedule",
        ...studentCreds(),
        requestId: request.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-pending-reschedules"] });
      queryClient.invalidateQueries({ queryKey: ["simple-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["simple-time-slots"] });
      toast.success(language === "ru" ? "Перенос подтверждён" : "Ауыстыру расталды");
    },
    onError: () => {
      toast.error(language === "ru" ? "Ошибка при подтверждении" : "Растау қатесі");
    },
  });

  // Reject reschedule request from creator/teacher
  const rejectIncomingReschedule = useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment: string }) => {
      await invokeApi("manage-bookings", {
        action: "reject_reschedule",
        ...studentCreds(),
        requestId,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-pending-reschedules"] });
      setRejectingRequestId(null);
      toast.success(language === "ru" ? "Запрос отклонён" : "Сұраныс қабылданбады");
    },
    onError: () => {
      toast.error(language === "ru" ? "Ошибка" : "Қате");
    },
  });

  const rescheduleRequest = useMutation({
    mutationFn: async (data: {
      bookingId: string;
      productId: string;
      productTitle: string;
      scheduleId: string;
      oldDate: string;
      oldTime: string;
      newDate: string;
      newTime: string;
      reasons: string[];
      comment: string;
    }) => {
      await invokeApi("manage-bookings", {
        action: "create_reschedule_request",
        ...studentCreds(),
        bookingId: data.bookingId,
        scheduleId: data.scheduleId,
        productId: data.productId,
        productTitle: data.productTitle,
        oldDate: data.oldDate,
        oldTime: data.oldTime,
        newDate: data.newDate,
        newTime: data.newTime,
        reasons: data.reasons,
        comment: data.comment,
      });
    },
    onSuccess: () => {
      toast.success(language === "ru" ? "Запрос на перенос отправлен" : "Ауыстыру сұранысы жіберілді");
      setRescheduleBooking(null);
      queryClient.invalidateQueries({ queryKey: ["student-pending-reschedules"] });
      queryClient.invalidateQueries({ queryKey: ["student-incoming-reschedules"] });
      queryClient.invalidateQueries({ queryKey: ["student-incoming-reschedules-count"] });
    },
    onError: () => {
      toast.error(language === "ru" ? "Ошибка при отправке запроса" : "Сұраныс жіберу қатесі");
    },
  });

  const { data: rawTimeSlots, isLoading: timeSlotsLoading } = useSimpleTimeSlots(selectedScheduleId || undefined);

  const timeSlots = useMemo(() => {
    if (!rawTimeSlots) return [];
    if (timezone.offset === 5) return rawTimeSlots;
    return rawTimeSlots.map((slot) => {
      const startConv = convertSlotToUser(slot.date, slot.start_time);
      const endConv = convertSlotToUser(slot.date, slot.end_time);
      return {
        ...slot,
        date: startConv.date,
        start_time: `${startConv.time}:00`,
        end_time: `${endConv.time}:00`,
      };
    });
  }, [rawTimeSlots, timezone.offset, convertSlotToUser]);
  const { data: allBookingsForSchedule } = useAllBookingsForSchedule(selectedScheduleId || undefined);
  
  // Получить текущий выбранный schedule для проверки event_type
  const selectedSchedule = schedules?.find(s => s.id === selectedScheduleId);

  // Загрузить учителей для продуктов с can_choose_teacher
  useEffect(() => {
    const loadTeachers = async () => {
      if (!purchases || purchases.length === 0) return;
      
      console.log("ScheduleTab: Loading teachers for purchases:", purchases);
      
      // Проверяем, есть ли покупки с can_choose_teacher
      const purchaseWithChoice = purchases.find(p => p.can_choose_teacher);
      setCanChooseTeacher(!!purchaseWithChoice);
      
      if (!purchaseWithChoice) {
        // Если нельзя выбирать учителя, используем assigned_teacher_id
        const assignedTeacherId = purchases.find(p => p.assigned_teacher_id)?.assigned_teacher_id;
        console.log("ScheduleTab: No choice mode, assigned_teacher_id:", assignedTeacherId);
        if (assignedTeacherId) {
          setSelectedTeacherId(assignedTeacherId);
        }
        return;
      }
      
      // Загружаем всех учителей для продуктов
      const productIds = [...new Set(purchases.map(p => p.product_id))];
      const teacherRecords: { teacher_name: string }[] = [];
      for (const productId of productIds) {
        const data = await invokeApi<{ teachers: { teacher_name: string }[] }>("catalog", {
          action: "list_teachers",
          productId,
        });
        teacherRecords.push(...(data.teachers ?? []));
      }
      
      if (teacherRecords.length > 0) {
        const teacherNames = new Set(teacherRecords.map(t => t.teacher_name));
        const teacherIds = [...new Set((schedules || []).map(s => s.teacher_id).filter(Boolean))] as string[];
        if (teacherIds.length) {
          const usersData = await invokeApi<{ users: { id: string; name: string }[] }>("manage-products", {
            action: "list_users_by_ids",
            ...studentCreds(),
            ids: teacherIds,
          });
          const teacherUsers = (usersData.users ?? []).filter((u) => teacherNames.has(u.name));
          console.log("ScheduleTab: Found teachers:", teacherUsers);
          setTeachers(teacherUsers.map(u => ({ id: u.id, name: u.name })));
        }
      }
    };
    
    loadTeachers();
  }, [purchases, schedules]);

  // Фильтруем schedules по выбранному учителю
  const filteredSchedules = useMemo(() => {
    if (!schedules) return [];
    
    console.log("ScheduleTab: Filtering schedules. selectedTeacherId:", selectedTeacherId, "canChooseTeacher:", canChooseTeacher);
    console.log("ScheduleTab: All schedules:", schedules);
    
    // Если назначен конкретный учитель - показываем только его расписания
    if (selectedTeacherId) {
      const filtered = schedules.filter(s => s.teacher_id === selectedTeacherId);
      console.log("ScheduleTab: Filtered by assigned teacher:", filtered);
      return filtered;
    }
    
    // Если можно выбирать учителя - показываем ВСЕ расписания (всех учителей)
    if (canChooseTeacher) {
      console.log("ScheduleTab: canChooseTeacher=true, showing all teacher schedules:", schedules);
      return schedules;
    }
    
    // Если нельзя выбирать и нет назначенного учителя - сначала ищем расписания автора (без teacher_id)
    const authorSchedules = schedules.filter(s => !s.teacher_id);
    console.log("ScheduleTab: Author schedules (no teacher_id):", authorSchedules);
    
    // Если расписаний автора нет, но есть расписания учителей — показываем ВСЕ расписания
    // (это случай когда автор создал ссылку без параметра учителя, но расписания ведут учителя)
    if (authorSchedules.length === 0 && schedules.length > 0) {
      console.log("ScheduleTab: No author schedules found, showing all schedules as fallback");
      return schedules;
    }
    
    return authorSchedules;
  }, [schedules, selectedTeacherId, canChooseTeacher]);

  useEffect(() => {
    if (filteredSchedules.length > 0) {
      if (!selectedScheduleId || !filteredSchedules.some(s => s.id === selectedScheduleId)) {
        setSelectedScheduleId(filteredSchedules[0].id);
      }
    }
  }, [filteredSchedules, selectedScheduleId]);

  // Показывать 7 дней начиная с сегодня (i начинается с 0)
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  const filteredSlots = useMemo(() => {
    if (!timeSlots) return [];
    return timeSlots.filter((slot) => 
      isSameDay(parseISO(slot.date), selectedDate)
    );
  }, [timeSlots, selectedDate]);

  // Получить количество бронирований для слота
  const getBookingsCountForSlot = (slotId: string) => {
    return allBookingsForSchedule?.filter(b => b.time_slot_id === slotId).length || 0;
  };

  // Проверить, полностью ли занят слот
  const isSlotFullyBooked = (slotId: string) => {
    const bookingsCount = getBookingsCountForSlot(slotId);
    if (bookingsCount === 0) return false;
    
    const slot = timeSlots?.find(s => s.id === slotId);
    const maxParticipants = slot?.max_participants ?? (selectedSchedule?.event_type === "group" ? (selectedSchedule.max_participants || 1) : 1);
    return bookingsCount >= maxParticipants;
  };

  // Получить статус дня: "free" | "partial" | "full"
  const getDayStatus = (date: Date): "free" | "partial" | "full" => {
    if (!timeSlots) return "free";
    
    const daySlots = timeSlots.filter(slot => isSameDay(parseISO(slot.date), date));
    if (daySlots.length === 0) return "free";
    
    const fullyBookedCount = daySlots.filter(slot => isSlotFullyBooked(slot.id)).length;
    const partiallyBookedCount = daySlots.filter(slot => {
      const bookingsCount = getBookingsCountForSlot(slot.id);
      return bookingsCount > 0 && !isSlotFullyBooked(slot.id);
    }).length;
    
    if (fullyBookedCount === daySlots.length) return "full";
    if (fullyBookedCount > 0 || partiallyBookedCount > 0) return "partial";
    return "free";
  };

  // Получить статус слота: "free" | "partial" | "full"
  const getSlotStatus = (slotId: string): "free" | "partial" | "full" => {
    const bookingsCount = getBookingsCountForSlot(slotId);
    if (bookingsCount === 0) return "free";
    if (isSlotFullyBooked(slotId)) return "full";
    return "partial";
  };

  const handleBookSlot = async (slotId: string) => {
    if (!selectedScheduleId) return;
    
    try {
      await createBooking.mutateAsync({
        timeSlotId: slotId,
        scheduleId: selectedScheduleId,
      });
      toast.success(t("bookingConfirmed"));
    } catch (error) {
      toast.error(t("bookingFailed"));
    }
  };

  const handleCancelBooking = async (reasons: string[], comment: string) => {
    if (!bookingToCancel) return;
    try {
      await cancelBooking.mutateAsync({ 
        bookingId: bookingToCancel,
        reasons,
        comment 
      });
      toast.success(t("bookingCancelled"));
    } catch (error) {
      toast.error(t("cancelFailed"));
    } finally {
      setBookingToCancel(null);
    }
  };

  // Проверить, забронирован ли слот текущим пользователем
  const isSlotBookedByMe = (slotId: string) => {
    return bookings?.some((b) => b.time_slot_id === slotId && b.status === "confirmed");
  };

  // Проверить, занят ли слот другим пользователем (для индивидуальных сессий)
  const isSlotTakenByOther = (slotId: string) => {
    const myBooking = bookings?.find(b => b.time_slot_id === slotId);
    const anyBooking = allBookingsForSchedule?.find(b => b.time_slot_id === slotId);
    // Слот занят другим, если есть бронирование, но не моё
    return !!anyBooking && !myBooking;
  };

  const isLoading = purchasesLoading || schedulesLoading || bookingsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!purchases || purchases.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground">{t("noPurchasedProducts")}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("purchaseForSchedule")}
        </p>
      </div>
    );
  }

  // Фильтруем будущие бронирования (включая сегодня)
  const upcomingBookings = bookings?.filter(b => {
    if (!b.time_slot?.date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const slotDate = parseISO(b.time_slot.date);
    slotDate.setHours(0, 0, 0, 0);
    return slotDate >= today;
  }) || [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t("schedule")}</h2>
      {/* Мои записи */}
      {upcomingBookings.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary" />
            {t("myBookings")}
          </h2>
          <div className="space-y-2">
            {upcomingBookings.map((booking) => (
              <div
                key={booking.id}
                className="p-3 sm:p-4 rounded-xl border border-green-500/30 bg-green-500/5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {booking.product?.title || booking.schedule?.title}
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {(() => {
                        const formatted = formatSlotTime(
                          booking.time_slot?.date || "",
                          booking.time_slot?.start_time || "",
                          booking.time_slot?.end_time || ""
                        );
                        return (
                          <>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatted.date && format(parseISO(formatted.date), "d MMM", { locale: ru })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatted.timeRange}
                            </span>
                          </>
                        );
                      })()}
                      <span className="flex items-center gap-1">
                        {booking.schedule?.event_type === "group" ? (
                          <Users className="w-3.5 h-3.5" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                        {booking.schedule?.event_type === "group" ? t("group") : t("individual")}
                      </span>
                      <span className="flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5" />
                        {booking.schedule?.teacher_name || t("author")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (booking.time_slot?.lesson_link) {
                          window.open(booking.time_slot.lesson_link, "_blank");
                        }
                      }}
                      className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title={language === "ru" ? "Видеозвонок" : "Бейне қоңырау"}
                    >
                      <Video className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const formatted = formatSlotTime(
                          booking.time_slot?.date || "",
                          booking.time_slot?.start_time || "",
                          booking.time_slot?.end_time || ""
                        );
                        setRescheduleBooking({
                          id: booking.id,
                          productTitle: booking.product?.title || booking.schedule?.title || "",
                          productId: booking.product?.id || "",
                          scheduleId: booking.schedule?.id || "",
                          date: formatted.date,
                          startTime: formatted.startTime,
                          endTime: formatted.endTime,
                        });
                      }}
                      className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Timer className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBookingToCancel(booking.id)}
                      disabled={cancelBooking.isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {/* Lesson link if available */}
                {booking.time_slot?.lesson_link && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm font-medium">
                        <LinkIcon className="w-4 h-4" />
                        {t("lessonLink")}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900"
                        onClick={() => {
                          navigator.clipboard.writeText(booking.time_slot.lesson_link!);
                          toast.success(t("linkCopied"));
                        }}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        {t("copy")}
                      </Button>
                    </div>
                    <a 
                      href={booking.time_slot.lesson_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                    >
                      {booking.time_slot.lesson_link}
                    </a>
                  </div>
                )}
                {(() => {
                  const pendingReq = pendingReschedules.find(r => r.booking_id === booking.id);
                  if (!pendingReq) return null;
                  
                  const isFromTeacherOrCreator = pendingReq.requested_by === "creator" || pendingReq.requested_by === "teacher";
                  
                  if (isFromTeacherOrCreator) {
                    // Incoming request from creator/teacher — show approve/reject
                    return (
                      <div className="mt-2 p-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 space-y-2">
                        <div className="text-orange-600 dark:text-orange-400 text-sm font-medium">
                          {language === "ru"
                            ? `Преподаватель просит перенести на ${format(parseISO(pendingReq.new_date), "d MMM", { locale: ru })} ${pendingReq.new_time?.slice(0, 5)}`
                            : `Мұғалім ${format(parseISO(pendingReq.new_date), "d MMM", { locale: ru })} ${pendingReq.new_time?.slice(0, 5)} уақытына ауыстыруды сұрайды`}
                        </div>
                        {((pendingReq.reasons?.length > 0) || pendingReq.comment) && (
                          <div className="text-xs text-muted-foreground italic">
                            {pendingReq.comment || pendingReq.reasons?.join(", ")}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => approveIncomingReschedule.mutate(pendingReq)}
                            disabled={approveIncomingReschedule.isPending || rejectIncomingReschedule.isPending}
                            className="h-7 text-xs px-3"
                          >
                            {approveIncomingReschedule.isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <><Check className="w-3.5 h-3.5 mr-1" />{language === "ru" ? "Подтвердить" : "Растау"}</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectingRequestId(pendingReq.id)}
                            disabled={approveIncomingReschedule.isPending || rejectIncomingReschedule.isPending}
                            className="h-7 text-xs px-3 text-destructive border-destructive/30"
                          >
                            <X className="w-3.5 h-3.5 mr-1" />{language === "ru" ? "Отклонить" : "Қабылдамау"}
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  
                  // Student's own outgoing request — show pending status
                  return (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-orange-500 text-sm font-medium">
                        {language === "ru"
                          ? `Ожидание подтверждения переноса на ${pendingReq.new_time?.slice(0, 5)}`
                          : `Ауыстыруды растауды күтуде: ${pendingReq.new_time?.slice(0, 5)}`}
                      </span>
                      <button
                        onClick={() => cancelRescheduleRequest.mutate(pendingReq.id)}
                        disabled={cancelRescheduleRequest.isPending}
                        className="text-orange-500 hover:text-destructive transition-colors p-0.5 rounded-full hover:bg-muted"
                        title={language === "ru" ? "Отменить запрос" : "Сұранысты болдырмау"}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold text-foreground">{t("scheduleSessions")}</h2>

      {/* Выбор учителя - если можно выбирать */}
      {canChooseTeacher && teachers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="w-4 h-4" />
            <span>{t("selectTeacher")}</span>
          </div>
          <Select
            value={selectedTeacherId || "all"}
            onValueChange={(value) => setSelectedTeacherId(value === "all" ? null : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("selectTeacher")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allTeachers")}</SelectItem>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!filteredSchedules || filteredSchedules.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{t("noSchedules")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("noSchedulesEnabled")}</p>
        </div>
      ) : (
        <>
          {/* Schedule Selection if more than 1 */}
          {filteredSchedules.length > 1 && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                {filteredSchedules.map((schedule) => (
                  <button
                    key={schedule.id}
                    onClick={() => setSelectedScheduleId(schedule.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedScheduleId === schedule.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <h3 className="font-medium text-foreground text-sm">
                      {schedule.title && schedule.title !== "Расписание" && schedule.title !== "Кесте"
                        ? schedule.title
                        : (schedule.product_title || schedule.title)}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {schedule.teacher_name || t("author")}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedScheduleId && (
            <>
              {/* Date Selection */}
              <div className="space-y-3">
                <h3 className="font-medium text-foreground">{t("selectDate")}</h3>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
                  {days.map((day) => {
                    const dayHasSlots = timeSlots?.some(slot => isSameDay(parseISO(slot.date), day));
                    const dayStatus = getDayStatus(day);
                    
                    // Цвета точки: красный - все свободны, оранжевый - частично, зеленый - все заняты
                    const getDotColor = () => {
                      if (isSameDay(day, selectedDate)) return "bg-primary-foreground";
                      switch (dayStatus) {
                        case "full": return "bg-green-500";
                        case "partial": return "bg-orange-500";
                        case "free": return "bg-red-500";
                      }
                    };
                    
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`flex-shrink-0 p-3 rounded-xl text-center min-w-[72px] transition-all relative ${
                          isSameDay(day, selectedDate)
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border hover:border-primary/50"
                        }`}
                      >
                        {dayHasSlots && (
                          <span className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${getDotColor()}`} />
                        )}
                        <div className="text-xs opacity-80 mt-2">
                          {format(day, "EEE", { locale: ru })}
                        </div>
                        <div className="text-lg font-bold">{format(day, "d")}</div>
                        <div className="text-xs opacity-80">{format(day, "MMM", { locale: ru })}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Slots */}
              <div className="space-y-3">
                <h3 className="font-medium text-foreground">{t("availableTimes")}</h3>
                {timeSlotsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : filteredSlots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredSlots.map((slot) => {
                      const bookedByMe = isSlotBookedByMe(slot.id);
                      const takenByOther = isSlotTakenByOther(slot.id);
                      const maxParticipants = slot.max_participants ?? (selectedSchedule?.event_type === "group" ? (selectedSchedule.max_participants || 1) : 1);
                      const isGroup = maxParticipants > 1;
                      const isIndividual = !isGroup;
                      const slotStatus = getSlotStatus(slot.id);
                      
                      // Для индивидуальных сессий - слот недоступен если занят кем-то
                      const isTaken = isIndividual && takenByOther;
                      // Для групповых - слот недоступен только если полностью заполнен
                      const isGroupFull = isGroup && slotStatus === "full" && !bookedByMe;
                      const available = slot.is_available && !bookedByMe && !isTaken && !isGroupFull;
                      
                      // Цвета слота
                      const getSlotStyles = () => {
                        if (bookedByMe) return "bg-green-500/10 border-green-500 text-green-600";
                        if (isTaken || isGroupFull) return "bg-red-500/10 border-red-300 text-red-500";
                        
                        // Для доступных групповых слотов показать оранжевый если частично заняты
                        if (isGroup && slotStatus === "partial") {
                          return "border-orange-300 bg-orange-50 hover:border-orange-400";
                        }
                        
                        return "border-border hover:border-primary bg-card";
                      };
                      
                      const bookingsCount = getBookingsCountForSlot(slot.id);
                      
                      return (
                        <button
                          key={slot.id}
                          onClick={() => available && handleBookSlot(slot.id)}
                          disabled={!available || createBooking.isPending}
                          className={`p-4 rounded-xl border text-left transition-all ${getSlotStyles()} ${!available && !bookedByMe ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span className="font-medium">
                              {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)}
                            </span>
                            {bookedByMe && <Check className="w-4 h-4 ml-auto" />}
                            {isTaken && <span className="text-xs ml-auto">{t("slotTaken")}</span>}
                            {isGroupFull && !bookedByMe && <span className="text-xs ml-auto">{t("slotTaken")}</span>}
                            {isGroup && !bookedByMe && !isGroupFull && (
                              <span className="text-xs ml-auto text-muted-foreground">
                                {bookingsCount}/{maxParticipants >= 9999 ? "∞" : maxParticipants}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {t("noSlotsAvailable")}
                  </p>
                )}
              </div>
            </>
          )}

        </>
      )}

      {/* Confirm Cancel Dialog with Reasons */}
      <CancellationReasonDialog
        isOpen={!!bookingToCancel}
        onClose={() => setBookingToCancel(null)}
        onConfirm={handleCancelBooking}
        isPending={cancelBooking.isPending}
      />

      {/* Student Reschedule Request Dialog */}
      <StudentRescheduleDialog
        isOpen={!!rescheduleBooking}
        onClose={() => setRescheduleBooking(null)}
        booking={rescheduleBooking}
        isPending={rescheduleRequest.isPending}
        onConfirm={(data) => {
          if (!rescheduleBooking) return;
          rescheduleRequest.mutate({
            bookingId: rescheduleBooking.id,
            productId: rescheduleBooking.productId,
            productTitle: rescheduleBooking.productTitle,
            scheduleId: rescheduleBooking.scheduleId,
            oldDate: rescheduleBooking.date,
            oldTime: rescheduleBooking.startTime,
            newDate: data.newDate,
            newTime: data.newTime,
            reasons: data.reasons,
            comment: data.comment,
          });
        }}
      />

      {/* Reject Incoming Reschedule Dialog */}
      <RejectRescheduleDialog
        isOpen={!!rejectingRequestId}
        onClose={() => setRejectingRequestId(null)}
        onConfirm={(comment) => {
          if (!rejectingRequestId) return;
          rejectIncomingReschedule.mutate({ requestId: rejectingRequestId, comment });
        }}
        isPending={rejectIncomingReschedule.isPending}
      />
    </div>
  );
};

export default ScheduleTab;
