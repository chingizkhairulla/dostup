import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { playPaymentSound } from "@/hooks/useNotificationPermission";
// Push notifications are sent ONLY from server via database triggers
// DO NOT call showBrowserNotification here - it causes duplicate notifications!

interface NewPurchasePayload {
  new: {
    id: string;
    simple_user_id: string;
    product_id: string;
    amount: number;
    status: string;
    created_at: string;
  };
}

// Global set to track processed purchase IDs to prevent duplicate notifications
const processedPurchaseInserts = new Set<string>();

// Clean up old entries after 30 seconds
const cleanupProcessedIds = (id: string) => {
  setTimeout(() => {
    processedPurchaseInserts.delete(id);
  }, 30000);
};

export const useRealtimePurchaseNotifications = (productIds: string[], enabled: boolean = true) => {
  const queryClient = useQueryClient();
  const { language, l } = useLanguage();
  const productIdsRef = useRef<string[]>(productIds);

  useEffect(() => {
    productIdsRef.current = productIds;
  }, [productIds]);

  const fetchPurchaseDetails = useCallback(async (purchaseId: string) => {
    const { data: purchase } = await supabase
      .from("simple_purchases")
      .select(`
        id,
        amount,
        status,
        created_at,
        product_id,
        simple_user_id
      `)
      .eq("id", purchaseId)
      .single();

    if (!purchase) return null;

    // Fetch user details
    const { data: user } = await supabase
      .from("simple_users")
      .select("id, name, phone")
      .eq("id", purchase.simple_user_id)
      .single();

    // Fetch product details
    const { data: product } = await supabase
      .from("products")
      .select("id, title")
      .eq("id", purchase.product_id)
      .single();

    return {
      ...purchase,
      user,
      product
    };
  }, []);

  useEffect(() => {
    if (!enabled || productIdsRef.current.length === 0) return;

    const channel = supabase
      .channel("purchase-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "simple_purchases"
        },
        async (payload: NewPurchasePayload) => {
          const newPurchase = payload.new;
          
          // Skip if we already processed this purchase
          if (processedPurchaseInserts.has(newPurchase.id)) {
            console.log("Already processed purchase insert:", newPurchase.id);
            return;
          }
          processedPurchaseInserts.add(newPurchase.id);
          cleanupProcessedIds(newPurchase.id);
          
          // Check if the purchase is for one of creator's products
          if (!productIdsRef.current.includes(newPurchase.product_id)) {
            return;
          }

          // Fetch full purchase details
          const fullPurchase = await fetchPurchaseDetails(newPurchase.id);
          
          if (fullPurchase) {
            // Play payment sound
            playPaymentSound();
            
            const title = l({ ru: `Новая покупка от ${fullPurchase.user?.name || "Клиент"}`, kk: `${fullPurchase.user?.name || "Клиент"} жаңа сатып алу жасады`, en: `New purchase from ${fullPurchase.user?.name || "a customer"}` });
            
            const description = fullPurchase.product?.title || "";
            
            toast.info(title, {
              description,
              duration: 8000,
            });

            // Push notifications are sent ONLY from server via database triggers
            // DO NOT add showBrowserNotification here - it causes duplicate notifications!
          }

          // Refresh the purchases list
          queryClient.invalidateQueries({ queryKey: ["creator-purchases"] });
          queryClient.invalidateQueries({ queryKey: ["creator-pending-purchases"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, fetchPurchaseDetails, language]);
};

// Hook to get pending purchases for creator
export const useCreatorPendingPurchases = (productIds: string[]) => {
  return {
    queryKey: ["creator-pending-purchases", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];

      const { data: purchases } = await supabase
        .from("simple_purchases")
        .select(`
          id,
          amount,
          status,
          created_at,
          product_id,
          simple_user_id
        `)
        .in("product_id", productIds)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!purchases?.length) return [];

      // Fetch user details
      const userIds = [...new Set(purchases.map(p => p.simple_user_id))];
      const { data: users } = await supabase
        .from("simple_users")
        .select("id, name, phone")
        .in("id", userIds);

      // Fetch product details
      const { data: products } = await supabase
        .from("products")
        .select("id, title")
        .in("id", productIds);

      return purchases.map(purchase => ({
        ...purchase,
        user: users?.find(u => u.id === purchase.simple_user_id),
        product: products?.find(p => p.id === purchase.product_id)
      }));
    },
    enabled: productIds.length > 0
  };
};
