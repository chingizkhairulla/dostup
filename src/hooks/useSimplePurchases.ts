import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { creatorCreds, sessionCreds, studentCreds, invokeApi } from "@/lib/sessionApi";

interface SimplePurchase {
  id: string;
  product_id: string;
  status: string;
  amount: number;
  created_at: string;
  can_choose_teacher: boolean | null;
  assigned_teacher_id: string | null;
  product: {
    id: string;
    title: string;
    headline: string | null;
    telegram_link: string | null;
    group_link_label: string | null;
  } | null;
}

interface SimpleMaterial {
  id: string;
  title: string;
  type: string;
  content: string | null;
  file_url: string | null;
  order_index: number;
  product_id: string;
  allow_view?: boolean;
  allow_download?: boolean;
  teacher_id: string | null;
  available_at: string | null;
  parent_id: string | null;
  product?: { id: string; title: string; telegram_link: string | null } | null;
  teacher_name: string | null;
  is_teacher_material: boolean;
}

interface SimpleSchedule {
  id: string;
  product_id: string;
  title: string;
  event_type: string;
  max_participants: number | null;
  teacher_id: string | null;
  created_at: string;
  teacher_name: string | null;
}

interface SimpleTimeSlot {
  id: string;
  schedule_id: string;
  date: string;
  start_time: string;
  end_time: string;
  lesson_link?: string | null;
  [key: string]: unknown;
}

interface SlotBooking {
  id: string;
  time_slot_id: string;
  simple_user_id: string;
  schedule_id?: string;
  status: string;
  created_at?: string;
  user?: { id: string; name: string; phone: string | null } | null;
}

function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Получить покупки пользователя (с возможностью фильтрации по статусу)
export const useSimplePurchases = (options?: { status?: "completed" | "pending" | "all" }) => {
  const { user } = useSimpleAuth();
  const queryClient = useQueryClient();
  const status = options?.status || "all";

  // Realtime подписка для автоматического обновления при подтверждении, отклонении или отмене покупки
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-purchases-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "simple_purchases",
        },
        (payload: any) => {
          const rec = payload.new || payload.old;
          if (
            rec &&
            (rec.buyer_profile_id === user.id || rec.simple_user_id === user.id)
          ) {
            queryClient.invalidateQueries({ queryKey: ["simple-purchases"] });
            queryClient.invalidateQueries({ queryKey: ["simple-materials"] });
            queryClient.invalidateQueries({ queryKey: ["simple-schedules"] });
            queryClient.invalidateQueries({ queryKey: ["simple-subscriptions"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return useQuery({
    queryKey: ["simple-purchases", user?.id, status],
    queryFn: async () => {
      if (!user) return [] as SimplePurchase[];

      const data = await invokeApi<{ purchases: SimplePurchase[] }>("checkout", {
        action: "list_my_purchases",
        ...studentCreds(),
        status,
      });
      return data.purchases ?? [];
    },
    enabled: !!user,
    refetchInterval: (query) => {
      const hasPending = query.state.data?.some((p) => p.status === "pending");
      return hasPending ? 4000 : false;
    },
    refetchOnWindowFocus: true,
  });
};

export interface BuyerSubscription {
  id: string;
  product_id: string;
  status: string;
  current_period_end: string;
  current_period_start: string;
  billing_period: string;
  has_access: boolean;
  product: {
    id: string;
    title: string;
    headline: string | null;
    telegram_link: string | null;
    group_link_label: string | null;
    slug: string | null;
    billing_period: string | null;
    price: number;
  } | null;
}

export const useSimpleSubscriptions = () => {
  const { user } = useSimpleAuth();

  return useQuery({
    queryKey: ["simple-subscriptions", user?.id],
    queryFn: async () => {
      if (!user) return [] as BuyerSubscription[];

      const data = await invokeApi<{ subscriptions: BuyerSubscription[] }>("checkout", {
        action: "list_my_subscriptions",
        ...studentCreds(),
      });
      return data.subscriptions ?? [];
    },
    enabled: !!user,
  });
};

export const useCancelSubscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      await invokeApi("checkout", {
        action: "cancel_subscription",
        subscriptionId,
        ...studentCreds(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simple-subscriptions"] });
    },
  });
};

// Получить материалы для подтверждённых покупок (включая материалы назначенного учителя)
export const useSimpleMaterials = () => {
  const { data: purchases } = useSimplePurchases();

  return useQuery({
    queryKey: ["simple-materials", purchases?.map(p => `${p.product_id}-${p.assigned_teacher_id}-${p.can_choose_teacher}`)],
    queryFn: async () => {
      if (!purchases?.length) return [] as SimpleMaterial[];

      const data = await invokeApi<{
        materials: Array<Omit<SimpleMaterial, "product" | "teacher_name" | "is_teacher_material">>;
        purchases: Array<{ product_id: string }>;
      }>("manage-materials", {
        action: "list_student",
        ...studentCreds(),
      });

      const materials = data.materials ?? [];
      return materials.map((material) => {
        const product = purchases.find((p) => p.product_id === material.product_id)?.product;
        return {
          ...material,
          product: product
            ? { id: product.id, title: product.title, telegram_link: product.telegram_link }
            : null,
          teacher_name: null as string | null,
          is_teacher_material: !!material.teacher_id,
        };
      });
    },
    enabled: !!purchases?.length,
  });
};

// Получить расписания для подтверждённых покупок
export const useSimpleSchedules = () => {
  const { data: purchases } = useSimplePurchases();

  return useQuery({
    queryKey: ["simple-schedules", purchases?.map(p => p.product_id)],
    queryFn: async () => {
      if (!purchases?.length) return [] as SimpleSchedule[];

      const productIds = purchases.map((p) => p.product_id);
      const data = await invokeApi<{
        schedules: Array<Omit<SimpleSchedule, "teacher_name">>;
        purchases: unknown[];
      }>("manage-schedules", {
        action: "student_list_schedules",
        ...studentCreds(),
        productIds,
      });

      return (data.schedules ?? []).map((schedule) => ({
        ...schedule,
        teacher_name: null as string | null,
      }));
    },
    enabled: !!purchases?.length,
  });
};

// Получить time slots для расписания с realtime обновлениями
export const useSimpleTimeSlots = (scheduleId: string | undefined) => {
  const queryClient = useQueryClient();

  // Realtime подписка для обновления слотов при изменениях
  useEffect(() => {
    if (!scheduleId) return;

    const channel = supabase
      .channel(`time-slots-${scheduleId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "time_slots",
          filter: `schedule_id=eq.${scheduleId}`
        },
        () => {
          // При любом изменении слотов - обновить данные
          queryClient.invalidateQueries({ queryKey: ["simple-time-slots", scheduleId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleId, queryClient]);

  return useQuery({
    queryKey: ["simple-time-slots", scheduleId],
    queryFn: async () => {
      if (!scheduleId) return [] as SimpleTimeSlot[];

      const today = localToday();
      const data = await invokeApi<{ slots: SimpleTimeSlot[] }>("manage-schedules", {
        action: "student_list_slots",
        ...studentCreds(),
        scheduleIds: [scheduleId],
      });
      return (data.slots ?? []).filter((slot) => slot.date >= today);
    },
    enabled: !!scheduleId,
  });
};

// Получить ВСЕ бронирования для слотов расписания (для проверки занятости)
export const useAllBookingsForSchedule = (scheduleId: string | undefined) => {
  const queryClient = useQueryClient();

  // Realtime подписка для обновления при изменении бронирований
  useEffect(() => {
    if (!scheduleId) return;

    const channel = supabase
      .channel(`all-bookings-${scheduleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "simple_bookings",
          filter: `schedule_id=eq.${scheduleId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["all-bookings-schedule", scheduleId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleId, queryClient]);

  return useQuery({
    queryKey: ["all-bookings-schedule", scheduleId],
    queryFn: async () => {
      if (!scheduleId) return [] as SlotBooking[];

      const slotsData = await invokeApi<{ slots: { id: string }[] }>("manage-schedules", {
        action: "student_list_slots",
        ...studentCreds(),
        scheduleIds: [scheduleId],
      });
      const slotIds = (slotsData.slots ?? []).map((s) => s.id);
      if (!slotIds.length) return [];

      const data = await invokeApi<{ bookings: SlotBooking[] }>("manage-schedules", {
        action: "list_bookings_for_slots",
        ...studentCreds(),
        slotIds,
      });
      return (data.bookings ?? []).filter((b) => b.status === "confirmed");
    },
    enabled: !!scheduleId,
  });
};

// Получить бронирования пользователя с деталями
export const useSimpleBookings = () => {
  const { user } = useSimpleAuth();

  return useQuery({
    queryKey: ["simple-bookings", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const purchasesData = await invokeApi<{ purchases: SimplePurchase[] }>("checkout", {
        action: "list_my_purchases",
        ...studentCreds(),
        status: "completed",
      });
      const purchases = purchasesData.purchases ?? [];
      if (!purchases.length) return [];

      const productIds = purchases.map((p) => p.product_id);
      const schedulesData = await invokeApi<{ schedules: SimpleSchedule[] }>("manage-schedules", {
        action: "student_list_schedules",
        ...studentCreds(),
        productIds,
      });
      const schedules = schedulesData.schedules ?? [];
      if (!schedules.length) return [];

      const scheduleIds = schedules.map((s) => s.id);
      const slotsData = await invokeApi<{ slots: SimpleTimeSlot[] }>("manage-schedules", {
        action: "student_list_slots",
        ...studentCreds(),
        scheduleIds,
      });
      const slots = slotsData.slots ?? [];
      if (!slots.length) return [];

      const bookingsData = await invokeApi<{ bookings: SlotBooking[] }>("manage-schedules", {
        action: "list_bookings_for_slots",
        ...studentCreds(),
        slotIds: slots.map((s) => s.id),
      });
      const bookings = (bookingsData.bookings ?? []).filter(
        (b) => b.simple_user_id === user.id && b.status === "confirmed",
      );
      if (!bookings.length) return [];

      return bookings.map((booking) => {
        const schedule = schedules.find((s) => s.id === booking.schedule_id);
        const product = purchases.find((p) => p.product_id === schedule?.product_id)?.product;
        return {
          id: booking.id,
          time_slot_id: booking.time_slot_id,
          schedule_id: booking.schedule_id,
          status: booking.status,
          created_at: booking.created_at,
          time_slot: slots.find((s) => s.id === booking.time_slot_id),
          schedule: schedule
            ? { ...schedule, teacher_name: schedule.teacher_name ?? null }
            : undefined,
          product: product ? { id: product.id, title: product.title } : undefined,
        };
      });
    },
    enabled: !!user,
  });
};

// Создать бронирование
export const useCreateSimpleBooking = () => {
  const queryClient = useQueryClient();
  const { user } = useSimpleAuth();

  return useMutation({
    mutationFn: async ({ timeSlotId, scheduleId }: { timeSlotId: string; scheduleId: string }) => {
      if (!user) throw new Error("Not authenticated");

      const data = await invokeApi<{ booking: unknown }>("manage-bookings", {
        action: "create",
        ...studentCreds(),
        timeSlotId,
        scheduleId,
      });
      return data.booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simple-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["simple-time-slots"] });
    },
  });
};

// Отменить бронирование (для студента) с сохранением в cancellations
export const useCancelSimpleBooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, reasons, comment }: { bookingId: string; reasons?: string[]; comment?: string }) => {
      await invokeApi("manage-bookings", {
        action: "cancel",
        ...studentCreds(),
        bookingId,
        cancelledBy: "student",
        reasons,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simple-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["simple-time-slots"] });
    },
  });
};

// Отменить бронирование (для создателя/учителя) с сохранением в cancellations
export const useCreatorCancelBooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, cancelledBy, reasons, comment }: {
      bookingId: string;
      cancelledBy: "creator" | "teacher";
      reasons?: string[];
      comment?: string;
    }) => {
      await invokeApi("manage-bookings", {
        action: "cancel",
        ...sessionCreds(),
        bookingId,
        cancelledBy,
        reasons,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-simple-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["creator-week-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-week-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["simple-time-slots"] });
    },
  });
};

// Перенести время слота
export const useRescheduleSlot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slotId,
      scheduleId,
      newDate,
      newStartTime,
      newEndTime,
      reasons,
      comment,
    }: {
      slotId: string;
      scheduleId: string;
      newDate: string;
      newStartTime: string;
      newEndTime: string;
      reasons: string[];
      comment: string;
      rescheduledBy: "creator" | "teacher";
    }) => {
      await invokeApi("manage-bookings", {
        action: "reschedule_slot",
        ...sessionCreds(),
        slotId,
        scheduleId,
        newDate,
        newStartTime,
        newEndTime,
        reasons,
        comment,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-week-slots"] });
      queryClient.invalidateQueries({ queryKey: ["creator-week-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-week-slots"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-week-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["simple-time-slots"] });
      queryClient.invalidateQueries({ queryKey: ["simple-bookings"] });
    },
  });
};

// Отправить запрос на перенос от автора/учителя ученику
export const useCreatorRescheduleRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slotId,
      scheduleId,
      newDate,
      newStartTime,
      newEndTime,
      reasons,
      comment,
      teacherId,
    }: {
      slotId: string;
      scheduleId: string;
      newDate: string;
      newStartTime: string;
      newEndTime: string;
      reasons: string[];
      comment: string;
      requestedBy: "creator" | "teacher";
      teacherId?: string | null;
    }) => {
      await invokeApi("manage-bookings", {
        action: "create_reschedule_request",
        ...sessionCreds(),
        slotId,
        scheduleId,
        newDate,
        newStartTime,
        newEndTime,
        reasons,
        comment,
        teacherId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-week-slots"] });
      queryClient.invalidateQueries({ queryKey: ["creator-week-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-week-slots"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-week-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-reschedule-requests"] });
      queryClient.invalidateQueries({ queryKey: ["creator-outgoing-reschedules"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-outgoing-reschedules"] });
    },
  });
};

// Изменить время незабронированного слота
export const useEditSlotTime = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      slotId,
      newStartTime,
      newEndTime,
    }: {
      slotId: string;
      newStartTime: string;
      newEndTime: string;
    }) => {
      await invokeApi("manage-schedules", {
        action: "update_slot",
        ...sessionCreds(),
        slotId,
        updates: { start_time: newStartTime, end_time: newEndTime },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-week-slots"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-week-slots"] });
      queryClient.invalidateQueries({ queryKey: ["simple-time-slots"] });
    },
  });
};

// Получить все бронирования для создателя (для уведомлений)
// Показываем ТОЛЬКО бронирования на расписания автора (где teacher_id IS NULL)
export const useCreatorSimpleBookings = (productIds: string[]) => {
  return useQuery({
    queryKey: ["creator-simple-bookings", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];

      const productsData = await invokeApi<{ products: Array<{ id: string; title: string }> }>(
        "manage-products",
        {
          action: "list",
          ...creatorCreds(),
        },
      );
      const products = (productsData.products ?? []).filter((p) => productIds.includes(p.id));

      const schedulesData = await invokeApi<{
        schedules: Array<{ id: string; title: string; event_type: string; product_id: string }>;
      }>("manage-schedules", {
        action: "list_schedules",
        ...creatorCreds(),
        productIds,
        creatorOnly: true,
      });
      const schedules = schedulesData.schedules ?? [];
      if (!schedules.length) return [];

      const slotsData = await invokeApi<{ slots: Array<{ id: string; date: string; start_time: string; end_time: string }> }>(
        "manage-schedules",
        {
          action: "list_slots",
          ...creatorCreds(),
          scheduleIds: schedules.map((s) => s.id),
        },
      );
      const slots = slotsData.slots ?? [];
      if (!slots.length) return [];

      const bookingsData = await invokeApi<{ bookings: SlotBooking[] }>("manage-schedules", {
        action: "list_bookings_for_slots",
        ...creatorCreds(),
        slotIds: slots.map((s) => s.id),
      });
      const bookings = (bookingsData.bookings ?? []).filter((b) => b.status === "confirmed");
      if (!bookings.length) return [];

      return bookings.map((booking) => ({
        ...booking,
        time_slot: slots.find((s) => s.id === booking.time_slot_id),
        schedule: schedules.find((s) => s.id === booking.schedule_id),
        user: booking.user,
        product: products.find(
          (p) => p.id === schedules.find((s) => s.id === booking.schedule_id)?.product_id,
        ),
      }));
    },
    enabled: productIds.length > 0,
  });
};
