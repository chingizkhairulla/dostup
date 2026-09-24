import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, Eye, X, Check } from "lucide-react";
import { formatPriceTenge } from "@/lib/catalog";
import { useLanguage } from "@/contexts/LanguageContext";
import { creatorCreds, invokeApi, fetchCreatorReceiptBlob } from "@/lib/sessionApi";
import { needsCreatorReview } from "@/lib/paymentReview";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type CreatorPendingPurchase = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  product_id: string;
  user?: { id: string; name: string; phone: string } | null;
  product?: { id?: string; title: string };
  latest_submission?: {
    id: string;
    verification_status: string;
  } | null;
};

export function useCreatorPendingPurchases(creatorName: string | null) {
  return useQuery({
    queryKey: ["creator-pending-purchases", creatorName],
    queryFn: async () => {
      const [productsRes, purchasesRes] = await Promise.all([
        invokeApi<{ products: { id: string; title: string }[] }>("manage-products", {
          action: "list",
          ...creatorCreds(),
        }),
        invokeApi<{
          purchases: (CreatorPendingPurchase & { user?: { id: string; name: string; phone: string } | null })[];
        }>("manage-products", {
          action: "list_purchases",
          ...creatorCreds(),
        }),
      ]);
      const products = productsRes.products ?? [];
      return (purchasesRes.purchases ?? [])
        .filter(needsCreatorReview)
        .map((purchase) => ({
          ...purchase,
          product: products.find((p) => p.id === purchase.product_id) || purchase.product || { title: "Unknown" },
        }));
    },
    enabled: !!creatorName,
    refetchInterval: 8000,
  });
}

export default function CreatorPendingPayments({ creatorName }: { creatorName: string }) {
  const { t, language, l } = useLanguage();
  const queryClient = useQueryClient();
  const { data: pendingPurchases = [], isLoading } = useCreatorPendingPurchases(creatorName);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["creator-pending-purchases"] });
    queryClient.invalidateQueries({ queryKey: ["creator-pending-purchases-count"] });
    queryClient.invalidateQueries({ queryKey: ["creator-purchases"] });
  };

  const confirmPayment = useMutation({
    mutationFn: async (purchaseId: string) => {
      const data = await invokeApi<{ success?: boolean; error?: string }>("approve-purchase", {
        purchaseId,
        ...creatorCreds(),
        creatorName,
      });
      if (data && data.success === false) throw new Error(data.error || "Failed to approve");
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("paymentConfirmed"));
    },
    onError: () => toast.error(l({ ru: "Ошибка при подтверждении", kk: "Растау қатесі", en: "Could not confirm" })),
  });

  const rejectPayment = useMutation({
    mutationFn: async (purchaseId: string) => {
      await invokeApi("manage-products", {
        action: "update_purchase",
        ...creatorCreds(),
        purchaseId,
        updates: { status: "rejected" },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(l({ ru: "Запрос отклонён", kk: "Сұраныс қабылданбады", en: "Request rejected" }));
    },
    onError: () => toast.error(l({ ru: "Ошибка при отклонении", kk: "Қабылдамау қатесі", en: "Could not reject" })),
  });

  if (isLoading || pendingPurchases.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-warning" />
        <h2 className="text-lg font-semibold text-foreground">
          {t("pendingPayments")} ({pendingPurchases.length})
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">{t("pendingReceiptHint")}</p>

      {pendingPurchases.map((purchase) => (
        <Card key={purchase.id} className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-warning">
                  {(purchase.user?.name || "?").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {purchase.user?.name || t("student")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {purchase.product?.title} · {formatPriceTenge(Number(purchase.amount))}
                </p>
                {purchase.latest_submission?.id && (
                  <button
                    type="button"
                    className="mt-1 text-sm text-primary inline-flex items-center gap-1 hover:underline"
                    onClick={async () => {
                      try {
                        const blob = await fetchCreatorReceiptBlob(purchase.latest_submission!.id);
                        window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
                      } catch {
                        toast.error(l({ ru: "Не удалось открыть чек", kk: "Чекті ашу мүмкін болмады", en: "Could not open the receipt" }));
                      }
                    }}
                  >
                    <Eye className="w-4 h-4" />
                    {t("viewReceipt")}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => {
                  if (window.confirm(l({ ru: "Отклонить запрос на оплату?", kk: "Төлем сұранысын қабылдамайсыз ба?", en: "Reject this payment?" }))) {
                    rejectPayment.mutate(purchase.id);
                  }
                }}
                disabled={confirmPayment.isPending || rejectPayment.isPending}
              >
                {rejectPayment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
                {t("rejectPayment")}
              </Button>
              <Button
                className="flex-1"
                onClick={() => confirmPayment.mutate(purchase.id)}
                disabled={confirmPayment.isPending || rejectPayment.isPending}
              >
                {confirmPayment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                {t("confirmPayment")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
