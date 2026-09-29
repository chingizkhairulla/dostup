import { useMemo } from "react";
import { useSimplePurchases, useSimpleSubscriptions } from "@/hooks/useSimplePurchases";

/**
 * Products the buyer can open now: one-time purchases plus subscriptions with access.
 * A product bought once and later subscribed to is counted through the subscription only.
 */
export function useAccessibleProducts() {
  const { data: purchases = [], isLoading: purchasesLoading } = useSimplePurchases();
  const { data: subscriptions = [], isLoading: subsLoading } = useSimpleSubscriptions();

  const accessiblePurchases = useMemo(() => {
    const subscriptionProductIds = new Set(subscriptions.filter((s) => s.has_access).map((s) => s.product_id));
    const oneTime = purchases.filter((p) => !subscriptionProductIds.has(p.product_id));
    const fromSubs = subscriptions
      .filter((s) => s.has_access && s.product)
      .map((s) => ({
        id: s.id,
        product_id: s.product_id,
        product: s.product,
        created_at: s.current_period_start,
      }));
    return [...oneTime, ...fromSubs];
  }, [purchases, subscriptions]);

  const productIds = useMemo(
    () => [...new Set(accessiblePurchases.map((p) => p.product_id))],
    [accessiblePurchases],
  );

  return { accessiblePurchases, productIds, isLoading: purchasesLoading || subsLoading };
}
