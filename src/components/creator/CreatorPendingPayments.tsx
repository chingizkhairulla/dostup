import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, Eye, X, Check, ChevronRight } from "lucide-react";
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

interface CreatorPendingPaymentsProps {
  creatorName: string;
  /** "actions" — кнопки ✓/✗ (раздел «Пользователи»); "link" — только список, клик ведёт в «Пользователи». */
  mode?: "actions" | "link";
  onOpenUsers?: () => void;
}

export default function CreatorPendingPayments({ creatorName, mode = "actions", onOpenUsers }: CreatorPendingPaymentsProps) {
  const { t, language } = useLanguage();
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
      toast.success(t("accessGranted"));
    },
    onError: () => toast.error(language === "ru" ? "Ошибка при подтверждении" : "Растау қатесі"),
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
      toast.success(language === "ru" ? "Запрос отклонён" : "Сұраныс қабылданбады");
    },
    onError: () => toast.error(language === "ru" ? "Ошибка при отклонении" : "Қабылдамау қатесі"),
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
      <p className="text-sm text-muted-foreground">
        {mode === "link" ? t("pendingGoToUsersHint") : t("pendingReceiptHint")}
      </p>

      {mode === "link" && pendingPurchases.map((purchase, index) => (
        <Card
          key={purchase.id}
          role="button"
          tabIndex={0}
          onClick={onOpenUsers}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenUsers?.(); } }}
          className="border-warning/40 bg-warning/5 animate-fade-in cursor-pointer hover:bg-warning/10 transition-colors"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-warning">
                  {(purchase.user?.name || "?").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">
                  {t("newPurchaseTitle")} · {purchase.user?.name || t("student")}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {purchase.product?.title} · {formatPriceTenge(Number(purchase.amount))}
                </p>
              </div>
              <span className="text-xs text-primary inline-flex items-center gap-0.5 flex-shrink-0">
                {t("users")}
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </CardContent>
        </Card>
      ))}

      {mode === "actions" && pendingPurchases.map((purchase, index) => (
        <Card
          key={purchase.id}
          className="border-warning/40 bg-warning/5 animate-fade-in"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-warning">
                  {(purchase.user?.name || "?").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">
                  {purchase.user?.name || t("student")}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {purchase.product?.title} · {formatPriceTenge(Number(purchase.amount))}
                </p>
                {purchase.latest_submission?.id ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-primary inline-flex items-center gap-1 hover:underline"
                    onClick={async () => {
                      try {
                        const blob = await fetchCreatorReceiptBlob(purchase.latest_submission!.id);
                        window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
                      } catch {
                        toast.error(language === "ru" ? "Не удалось открыть чек" : "Чекті ашу мүмкін болмады");
                      }
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {t("viewReceipt")}
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {language === "ru" ? "Чек ещё не прикреплён" : "Чек әлі тіркелмеген"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground"
                  title={t("rejectPayment")}
                  aria-label={t("rejectPayment")}
                  onClick={() => {
                    if (window.confirm(language === "ru" ? "Отклонить запрос на оплату?" : "Төлем сұранысын қабылдамайсыз ба?")) {
                      rejectPayment.mutate(purchase.id);
                    }
                  }}
                  disabled={confirmPayment.isPending || rejectPayment.isPending}
                >
                  {rejectPayment.isPending && rejectPayment.variables === purchase.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  className="h-8 w-8 p-0"
                  title={t("confirmPayment")}
                  aria-label={t("confirmPayment")}
                  onClick={() => confirmPayment.mutate(purchase.id)}
                  disabled={confirmPayment.isPending || rejectPayment.isPending}
                >
                  {confirmPayment.isPending && confirmPayment.variables === purchase.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
