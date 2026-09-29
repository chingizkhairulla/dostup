import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, Eye, X, Check, FileText, ExternalLink, Undo2, AlertTriangle } from "lucide-react";
import { formatPriceTenge } from "@/lib/catalog";
import { useLanguage } from "@/contexts/LanguageContext";
import { creatorCreds, invokeApi, fetchCreatorReceiptBlob } from "@/lib/sessionApi";
import { needsCreatorReview } from "@/lib/paymentReview";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type PaymentMethodSummary = {
  id: string;
  type: "link" | "phone" | "card";
  bank: "kaspi" | "halyk" | "freedom" | "other" | null;
  bank_name: string | null;
  value: string;
  recipient_name: string | null;
};

export type CreatorPendingPurchase = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  product_id: string;
  user?: { id: string; name: string; phone: string } | null;
  product?: { id?: string; title: string };
  payment_method?: PaymentMethodSummary | null;
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

function formatPaymentMethod(pm?: PaymentMethodSummary | null): string {
  if (!pm) return "Способ оплаты не указан";
  const bankNames: Record<string, string> = {
    kaspi: "Kaspi",
    halyk: "Halyk Bank",
    freedom: "Freedom Bank",
  };
  const bankLabel = pm.bank === "other" ? (pm.bank_name || "Банк") : (bankNames[pm.bank || ""] || pm.bank || "");

  if (pm.type === "link") {
    return bankLabel ? `${bankLabel} (Ссылка / QR)` : "Ссылка / QR";
  }
  if (pm.type === "phone") {
    const rec = pm.recipient_name ? ` · ${pm.recipient_name}` : "";
    return `${bankLabel ? bankLabel + " · " : ""}Телефон ${pm.value}${rec}`;
  }
  if (pm.type === "card") {
    const rec = pm.recipient_name ? ` · ${pm.recipient_name}` : "";
    return `${bankLabel ? bankLabel + " · " : ""}Карта ${pm.value}${rec}`;
  }
  return pm.value || "Способ оплаты";
}

function formatPurchaseTime(dateIso: string): string {
  try {
    const date = new Date(dateIso);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateIso;
  }
}

// Receipt Thumbnail with local blob cache
function ReceiptThumbnail({
  submissionId,
  onClick,
}: {
  submissionId: string;
  onClick: (previewUrl: string, isPdf: boolean) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    const loadThumbnail = async () => {
      setLoading(true);
      try {
        const blob = await fetchCreatorReceiptBlob(submissionId);
        if (!active) return;
        const pdf = blob.type === "application/pdf";
        setIsPdf(pdf);
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setBlobUrl(url);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadThumbnail();

    return () => {
      active = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [submissionId]);

  if (loading) {
    return (
      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center border shrink-0">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (failed || !blobUrl) {
    return (
      <button
        type="button"
        onClick={() => onClick("", false)}
        className="w-14 h-14 rounded-lg bg-muted flex flex-col items-center justify-center border shrink-0 hover:bg-muted/80 text-muted-foreground transition"
        title="Открыть чек"
      >
        <Eye className="w-5 h-5" />
        <span className="text-[9px] mt-0.5 font-medium">Чек</span>
      </button>
    );
  }

  if (isPdf) {
    return (
      <button
        type="button"
        onClick={() => onClick(blobUrl, true)}
        className="w-14 h-14 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex flex-col items-center justify-center shrink-0 hover:opacity-90 transition group cursor-pointer"
        title="Открыть PDF чек"
      >
        <FileText className="w-6 h-6 text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform" />
        <span className="text-[10px] font-bold text-red-700 dark:text-red-300">PDF</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick(blobUrl, false)}
      className="w-14 h-14 rounded-lg border overflow-hidden shrink-0 relative hover:ring-2 hover:ring-primary/50 transition cursor-pointer group bg-muted/20"
      title="Нажмите, чтобы увеличить чек"
    >
      <img
        src={blobUrl}
        alt="Чек"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
      />
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <Eye className="w-4 h-4 text-white" />
      </div>
    </button>
  );
}

export default function CreatorPendingPayments({
  creatorName,
  highlightPurchaseId,
}: {
  creatorName: string;
  highlightPurchaseId?: string;
}) {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const { data: pendingPurchases = [], isLoading } = useCreatorPendingPurchases(creatorName);

  // Lightbox state
  const [lightboxData, setLightboxData] = useState<{ url: string; isPdf: boolean } | null>(null);

  // Undo approval state: purchaseId -> timeout ID
  const pendingApprovalsRef = useRef<Map<string, number>>(new Map());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());

  // Highlight scroll ref
  const highlightCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightPurchaseId && highlightCardRef.current) {
      highlightCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightPurchaseId, pendingPurchases]);

  // Clean up any timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timeoutId of pendingApprovalsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      pendingApprovalsRef.current.clear();
    };
  }, []);

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
    },
    onError: () => {
      toast.error(language === "ru" ? "Ошибка при подтверждении" : "Растау қатесі");
      invalidate();
    },
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

  // Single-tap approval with 5-second undo toast
  const handleSingleTapConfirm = (purchaseId: string) => {
    // Add to approving state immediately
    setApprovingIds((prev) => new Set(prev).add(purchaseId));

    // Show 5-second toast "Доступ открыт · Отменить"
    toast("Доступ открыт · Отменить", {
      duration: 5000,
      action: {
        label: "Отменить",
        onClick: () => {
          // User tapped undo! Cancel timeout and send NOTHING to buyer
          const timerId = pendingApprovalsRef.current.get(purchaseId);
          if (timerId) {
            window.clearTimeout(timerId);
            pendingApprovalsRef.current.delete(purchaseId);
          }
          setApprovingIds((prev) => {
            const next = new Set(prev);
            next.delete(purchaseId);
            return next;
          });
          toast.info("Подтверждение отменено");
        },
      },
    });

    // Defer the actual approval call until the 5-second toast expires
    const timeoutId = window.setTimeout(async () => {
      pendingApprovalsRef.current.delete(purchaseId);
      try {
        await confirmPayment.mutateAsync(purchaseId);
      } finally {
        setApprovingIds((prev) => {
          const next = new Set(prev);
          next.delete(purchaseId);
          return next;
        });
      }
    }, 5000);

    pendingApprovalsRef.current.set(purchaseId, timeoutId);
  };

  const handleCancelUndo = (purchaseId: string) => {
    const timerId = pendingApprovalsRef.current.get(purchaseId);
    if (timerId) {
      window.clearTimeout(timerId);
      pendingApprovalsRef.current.delete(purchaseId);
    }
    setApprovingIds((prev) => {
      const next = new Set(prev);
      next.delete(purchaseId);
      return next;
    });
    toast.info("Подтверждение отменено");
  };

  if (isLoading || pendingPurchases.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-warning" />
        <h2 className="text-lg font-semibold text-foreground">
          Ожидающие подтверждения ({pendingPurchases.length})
        </h2>
      </div>

      {/* Mandatory line above list */}
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 p-3 text-sm text-amber-900 dark:text-amber-200 font-medium leading-relaxed">
        Сверьте поступление в банковском приложении: чек легко подделать.
      </div>

      <div className="space-y-3">
        {pendingPurchases.map((purchase) => {
          const isApproving = approvingIds.has(purchase.id);
          const isHighlighted = highlightPurchaseId === purchase.id;

          return (
            <Card
              key={purchase.id}
              ref={isHighlighted ? highlightCardRef : undefined}
              className={cn(
                "transition-all duration-300 border bg-card",
                isHighlighted && "ring-2 ring-primary border-primary shadow-md bg-primary/5",
                isApproving && "opacity-80 border-success/40 bg-success/5",
                !isHighlighted && !isApproving && "border-warning/30 bg-warning/5"
              )}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {/* Receipt thumbnail that opens lightbox */}
                  {purchase.latest_submission?.id ? (
                    <ReceiptThumbnail
                      submissionId={purchase.latest_submission.id}
                      onClick={(url, isPdf) => setLightboxData({ url, isPdf })}
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center border shrink-0 text-muted-foreground">
                      <FileText className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {purchase.user?.name || "Покупатель"}
                      </h3>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatPurchaseTime(purchase.created_at)}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-foreground mt-0.5">
                      {formatPriceTenge(Number(purchase.amount))} ·{" "}
                      <span className="text-muted-foreground font-normal">
                        {purchase.product?.title || "Курс"}
                      </span>
                    </p>

                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {formatPaymentMethod(purchase.payment_method)}
                    </p>
                  </div>
                </div>

                {isApproving ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-success/10 border border-success/30 text-xs">
                    <span className="font-medium text-success inline-flex items-center gap-1.5">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Доступ открыт (осталось несколько секунд для отмены)...</span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 min-h-[40px] text-xs text-foreground font-semibold hover:bg-success/20 border-success/40 inline-flex items-center gap-1 shrink-0 rounded-lg"
                      onClick={() => handleCancelUndo(purchase.id)}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Отменить
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-11 min-h-[44px] text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground font-semibold rounded-xl text-xs sm:text-sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            language === "ru"
                              ? "Отклонить чек? Покупатель получит уведомление и сможет прикрепить новый чек."
                              : "Чекті қабылдамайсыз ба?"
                          )
                        ) {
                          rejectPayment.mutate(purchase.id);
                        }
                      }}
                      disabled={confirmPayment.isPending || rejectPayment.isPending}
                    >
                      {rejectPayment.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1.5 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 mr-1.5 shrink-0" />
                      )}
                      <span>{t("rejectPayment")}</span>
                    </Button>

                    <Button
                      type="button"
                      className="flex-1 h-11 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs sm:text-sm shadow-2xs"
                      onClick={() => handleSingleTapConfirm(purchase.id)}
                      disabled={confirmPayment.isPending || rejectPayment.isPending}
                    >
                      <Check className="w-4 h-4 mr-1.5 shrink-0" />
                      <span>{t("confirmPayment")}</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Receipt Lightbox Dialog */}
      <Dialog open={!!lightboxData} onOpenChange={(open) => !open && setLightboxData(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-4 flex flex-col items-center">
          <DialogHeader className="w-full flex flex-row items-center justify-between pb-2 border-b">
            <DialogTitle className="text-base font-semibold">Чек об оплате</DialogTitle>
            {lightboxData?.url && (
              <a
                href={lightboxData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary inline-flex items-center gap-1 hover:underline mr-6"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                В новой вкладке
              </a>
            )}
          </DialogHeader>

          <div className="w-full flex-1 min-h-[300px] max-h-[70vh] flex items-center justify-center p-2 overflow-auto">
            {lightboxData?.isPdf ? (
              <iframe
                src={lightboxData.url}
                title="Чек PDF"
                className="w-full h-[65vh] border rounded-lg"
              />
            ) : lightboxData?.url ? (
              <img
                src={lightboxData.url}
                alt="Чек"
                className="max-h-[68vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
              />
            ) : (
              <div className="text-sm text-muted-foreground">Не удалось загрузить чек</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
