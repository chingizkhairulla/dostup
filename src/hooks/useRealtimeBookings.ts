import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { playBookingSound, playCancellationSound } from "@/hooks/useNotificationPermission";
import { setAppBadge } from "@/lib/appBadge";
// Push notifications are now sent ONLY from the server via database triggers
// DO NOT call showBrowserNotification here - it causes duplicate notifications!
interface BookingPayload {
  id: string;
  simple_user_id: string;
  schedule_id: string;
  time_slot_id: string;
  created_at: string;
  status?: string;
}

// Store deleted booking info before it's gone
interface DeletedBookingInfo {
  userName: string;
  productTitle: string;
  date: string;
  time: string;
  bookingId: string;
}

// Global set to track processed booking IDs to prevent duplicates
const processedBookingInserts = new Set<string>();
const processedBookingDeletes = new Set<string>();

// Clean up old entries after 30 seconds
const cleanupProcessedIds = (set: Set<string>, id: string) => {
  setTimeout(() => {
    set.delete(id);
  }, 30000);
};

export const useRealtimeBookingNotifications = (
  productIds: string[],
  enabled: boolean = true,
  currentBadgeCount: number = 0
) => {
  const queryClient = useQueryClient();
  const { language, l } = useLanguage();
  const productIdsRef = useRef<string[]>(productIds);
  const bookingCacheRef = useRef<Map<string, DeletedBookingInfo>>(new Map());
  const badgeCountRef = useRef<number>(currentBadgeCount);
  
  // Keep badge count ref updated
  useEffect(() => {
    badgeCountRef.current = currentBadgeCount;
  }, [currentBadgeCount]);
  
  // Keep productIds ref updated
  useEffect(() => {
    productIdsRef.current = productIds;
  }, [productIds]);

  const fetchBookingDetails = useCallback(async (bookingId: string) => {
    try {
      const { data: booking, error } = await supabase
        .from("simple_bookings")
        .select(`
          *,
          time_slot:time_slots(*),
          schedule:schedules(
            *,
            product:products(*)
          ),
          user:simple_users(*)
        `)
        .eq("id", bookingId)
        .single();

      if (error || !booking) return null;
      
      // Cache the booking info for potential DELETE events
      const info: DeletedBookingInfo = {
        userName: booking.user?.name || (l({ ru: "Ученик", kk: "Оқушы", en: "Student" })),
        productTitle: booking.schedule?.product?.title || "",
        date: booking.time_slot?.date || "",
        time: booking.time_slot?.start_time || "",
        bookingId: bookingId,
      };
      bookingCacheRef.current.set(bookingId, info);
      
      return booking;
    } catch {
      return null;
    }
  }, [language]);

  // Pre-cache existing bookings for DELETE notifications
  useEffect(() => {
    if (!enabled || productIds.length === 0) return;
    
    const cacheExistingBookings = async () => {
      // Only fetch schedules where teacher_id is null (creator's own schedules)
      const { data: schedules } = await supabase
        .from("schedules")
        .select("id")
        .in("product_id", productIds)
        .is("teacher_id", null);
      
      if (!schedules?.length) return;
      
      const scheduleIds = schedules.map(s => s.id);
      
      const { data: bookings } = await supabase
        .from("simple_bookings")
        .select(`
          id,
          time_slot:time_slots(date, start_time),
          schedule:schedules(product:products(title)),
          user:simple_users(name)
        `)
        .in("schedule_id", scheduleIds)
        .eq("status", "confirmed");
      
      bookings?.forEach((booking: any) => {
        const info: DeletedBookingInfo = {
          userName: booking.user?.name || (l({ ru: "Ученик", kk: "Оқушы", en: "Student" })),
          productTitle: booking.schedule?.product?.title || "",
          date: booking.time_slot?.date || "",
          time: booking.time_slot?.start_time || "",
          bookingId: booking.id,
        };
        bookingCacheRef.current.set(booking.id, info);
      });
    };
    
    cacheExistingBookings();
  }, [enabled, productIds, language]);

  useEffect(() => {
    if (!enabled || productIds.length === 0) return;

    console.log("Setting up realtime booking notifications for products:", productIds);

    const channel = supabase
      .channel("creator-booking-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "simple_bookings",
        },
        async (payload) => {
          console.log("New booking received:", payload);
          
          const newBooking = payload.new as BookingPayload;
          
          // Skip if we already processed this booking
          if (processedBookingInserts.has(newBooking.id)) {
            console.log("Already processed booking insert:", newBooking.id);
            return;
          }
          processedBookingInserts.add(newBooking.id);
          cleanupProcessedIds(processedBookingInserts, newBooking.id);
          
          // Fetch full booking details
          const bookingDetails = await fetchBookingDetails(newBooking.id);
          
          if (!bookingDetails) return;
          
          const productId = bookingDetails.schedule?.product_id;
          const teacherId = bookingDetails.schedule?.teacher_id;
          
          // Check if this booking is for one of the creator's products
          if (!productIdsRef.current.includes(productId)) {
            console.log("Booking is not for creator's product, ignoring");
            return;
          }
          
          // IMPORTANT: Only notify creator for their own schedules (teacher_id = null)
          // Teacher schedules have their own notification flow
          if (teacherId !== null) {
            console.log("Booking is for teacher's schedule, not notifying creator");
            return;
          }

          // Play notification sound
          playBookingSound();

          // Show toast notification
          const userName = bookingDetails.user?.name || (l({ ru: "Ученик", kk: "Оқушы", en: "Student" }));
          const productTitle = bookingDetails.schedule?.product?.title || "";
          const date = bookingDetails.time_slot?.date || "";
          const time = bookingDetails.time_slot?.start_time || "";

          const title = l({ ru: "Новая запись!", kk: "Жаңа жазба!", en: "New booking!" });
          const description = l({ ru: `${userName} записался на "${productTitle}" на ${date} в ${time}`, kk: `${userName} "${productTitle}" сабағына ${date} күні ${time} уақытына жазылды`, en: `${userName} booked "${productTitle}" for ${date} at ${time}` });

          toast.success(title, {
            description,
            duration: 10000,
          });

          // Push notifications are sent ONLY from server via database triggers
          // DO NOT add showBrowserNotification here - it causes duplicate notifications!

          // Update app badge
          const newBadgeCount = badgeCountRef.current + 1;
          setAppBadge(newBadgeCount);

          // Invalidate bookings query to refresh data
          queryClient.invalidateQueries({ queryKey: ["creator-simple-bookings"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "simple_bookings",
        },
        async (payload) => {
          console.log("Booking cancelled:", payload);
          
          const deletedBooking = payload.old as BookingPayload;
          
          // Skip if we already processed this deletion
          if (processedBookingDeletes.has(deletedBooking.id)) {
            console.log("Already processed booking delete:", deletedBooking.id);
            return;
          }
          processedBookingDeletes.add(deletedBooking.id);
          cleanupProcessedIds(processedBookingDeletes, deletedBooking.id);
          
          // Get cached info about the deleted booking
          const cachedInfo = bookingCacheRef.current.get(deletedBooking.id);
          
          if (!cachedInfo) {
            console.log("No cached info for deleted booking - not for creator's schedules");
            return;
          }

          console.log("Creator: Found cached booking info, showing cancellation notification");

          // Fetch cancellation details (reasons and comment) from booking_cancellations table
          const { data: cancellationData } = await supabase
            .from("booking_cancellations")
            .select("cancellation_reasons, cancellation_comment")
            .eq("booking_id", cachedInfo.bookingId)
            .single();

          const reasons = cancellationData?.cancellation_reasons || [];
          const comment = cancellationData?.cancellation_comment || "";

          // Play cancellation sound
          playCancellationSound();

          // Build description with reasons/comment
          let description = l({ ru: `${cachedInfo.userName} отменил запись на "${cachedInfo.productTitle}" на ${cachedInfo.date} в ${cachedInfo.time}`, kk: `${cachedInfo.userName} "${cachedInfo.productTitle}" сабағына ${cachedInfo.date} күні ${cachedInfo.time} жазбасын жойды`, en: `${cachedInfo.userName} cancelled their booking of "${cachedInfo.productTitle}" for ${cachedInfo.date} at ${cachedInfo.time}` });

          // Add reasons or comment to description
          if (comment) {
            description += `\n"${comment}"`;
          } else if (reasons.length > 0) {
            description += `\n${reasons.join(", ")}`;
          }

          const title = l({ ru: "Запись отменена", kk: "Жазба жойылды", en: "Booking cancelled" });

          toast.warning(title, {
            description,
            duration: 10000,
          });

          // Push notifications are sent ONLY from server via database triggers
          // DO NOT add showBrowserNotification here - it causes duplicate notifications!

          // Remove from cache
          bookingCacheRef.current.delete(deletedBooking.id);

          // Update app badge
          const newBadgeCount = badgeCountRef.current + 1;
          setAppBadge(newBadgeCount);

          // Invalidate queries to refresh data - include schedule and notification queries
          queryClient.invalidateQueries({ queryKey: ["creator-simple-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["creator-cancellations"] });
          queryClient.invalidateQueries({ queryKey: ["creator-cancellations-count"] });
          queryClient.invalidateQueries({ queryKey: ["creator-schedule-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["creator-week-slots"] });
          queryClient.invalidateQueries({ queryKey: ["time-slots"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reschedule_requests",
        },
        async (payload) => {
          const newRequest = payload.new as any;

          // Only handle reschedule requests for creator's products (schedules without teacher_id)
          if (!productIdsRef.current.includes(newRequest.product_id)) return;

          // Only show for student requests, not creator's own outgoing requests
          if (newRequest.requested_by && newRequest.requested_by !== "student") return;

          // Check if this is for creator's schedule (no teacher_id)
          if (newRequest.schedule_id) {
            const { data: schedule } = await supabase
              .from("schedules")
              .select("teacher_id")
              .eq("id", newRequest.schedule_id)
              .single();
            if (schedule?.teacher_id) return; // This is for a teacher, not creator
          }

          playBookingSound();

          // Fetch student name
          let studentName = l({ ru: "Ученик", kk: "Оқушы", en: "Student" });
          if (newRequest.simple_user_id) {
            const { data: student } = await supabase
              .from("simple_users")
              .select("name")
              .eq("id", newRequest.simple_user_id)
              .single();
            if (student) studentName = student.name;
          }

          const title = l({ ru: "Запрос на перенос", kk: "Ауыстыру сұранысы", en: "Reschedule request" });
          const description = l({ ru: `${studentName} просит перенести "${newRequest.product_title}" с ${newRequest.old_time?.slice(0, 5)} на ${newRequest.new_time?.slice(0, 5)}`, kk: `${studentName} "${newRequest.product_title}" сабағын ${newRequest.old_time?.slice(0, 5)} уақытынан ${newRequest.new_time?.slice(0, 5)} уақытына ауыстыруды сұрайды`, en: `${studentName} asks to move "${newRequest.product_title}" from ${newRequest.old_time?.slice(0, 5)} to ${newRequest.new_time?.slice(0, 5)}` });

          toast.info(title, { description, duration: 10000 });

          const newBadgeCount = badgeCountRef.current + 1;
          setAppBadge(newBadgeCount);

          queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests"] });
          queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests-count"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "reschedule_requests",
        },
        async (payload) => {
          const updated = payload.new as any;

          // Only handle responses to creator's own outgoing requests
          if (updated.requested_by !== "creator" && updated.requested_by !== "teacher") return;
          if (!productIdsRef.current.includes(updated.product_id)) return;
          if (updated.status === "pending") return;

          // Fetch student name
          let studentName = l({ ru: "Ученик", kk: "Оқушы", en: "Student" });
          if (updated.simple_user_id) {
            const { data: student } = await supabase
              .from("simple_users")
              .select("name")
              .eq("id", updated.simple_user_id)
              .single();
            if (student) studentName = student.name;
          }

          playBookingSound();

          if (updated.status === "approved") {
            const title = l({ ru: "Перенос подтверждён", kk: "Ауыстыру расталды", en: "Reschedule confirmed" });
            const description = l({ ru: `${studentName} подтвердил перенос "${updated.product_title}" на ${updated.new_time?.slice(0, 5)}`, kk: `${studentName} "${updated.product_title}" сабағын ${updated.new_time?.slice(0, 5)} уақытына ауыстыруды растады`, en: `${studentName} confirmed moving "${updated.product_title}" to ${updated.new_time?.slice(0, 5)}` });
            toast.success(title, { description, duration: 10000 });
          } else if (updated.status === "rejected") {
            const title = l({ ru: "Перенос отклонён", kk: "Ауыстыру қабылданбады", en: "Reschedule rejected" });
            const responseComment = updated.response_comment || "";
            const description = l({ ru: `${studentName} отклонил перенос "${updated.product_title}"${responseComment ? `: "${responseComment}"` : ""}`, kk: `${studentName} "${updated.product_title}" ауыстыруды қабылдамады${responseComment ? `: "${responseComment}"` : ""}`, en: `${studentName} отклонил перенос "${updated.product_title}"${responseComment ? `: "${responseComment}"` : ""}` });
            toast.warning(title, { description, duration: 10000 });
          }

          const newBadgeCount = badgeCountRef.current + 1;
          setAppBadge(newBadgeCount);

          queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests"] });
          queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests-count"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "reschedule_requests",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests"] });
          queryClient.invalidateQueries({ queryKey: ["creator-reschedule-requests-count"] });
        }
      )
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });

    return () => {
      console.log("Cleaning up realtime subscription");
      supabase.removeChannel(channel);
    };
  }, [enabled, productIds, fetchBookingDetails, queryClient, language]);
};
