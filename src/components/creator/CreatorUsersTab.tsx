import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronRight, Layers, Loader2, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatPriceTenge } from "@/lib/catalog";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import CreatorPendingPayments from "./CreatorPendingPayments";
import ProductSwitcher from "./ProductSwitcher";
import BuyerDetailsDialog, { UrgencyBadge, type BuyerPurchase } from "./BuyerDetailsDialog";
import { BUYER_PERIODS, periodStart, type BuyerPeriod } from "./buyerAccess";
import { useCreatorProducts } from "@/hooks/useProducts";
import { useSelectedCreatorProduct } from "@/hooks/useSelectedCreatorProduct";
import { cn } from "@/lib/utils";

type PurchaseWithUser = BuyerPurchase & {
  latest_submission?: {
    id: string;
    verification_status: string;
  } | null;
};

interface Teacher {
  id: string;
  name: string;
}

interface CreatorUsersTabProps {
  creatorName: string;
}

/**
 * "Buyers": who paid for which product, filtered by product (or all of them) and by when they
 * bought. A buyer's card holds their access period, payment date, status and receipts.
 */
const CreatorUsersTab = ({ creatorName }: CreatorUsersTabProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState(false);
  const [period, setPeriod] = useState<BuyerPeriod>("month");
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const { data: creatorProducts = [] } = useCreatorProducts();
  // Opens on the product picked in the other sections.
  const [selectedProductId, setSelectedProductId] = useSelectedCreatorProduct(creatorProducts);
  const showAll = allProducts && creatorProducts.length >= 2;

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["creator-purchases", creatorName],
    queryFn: async () => {
      if (!creatorName) return [];

      const [productsRes, purchasesRes] = await Promise.all([
        invokeApi<{ products: { id: string; title: string }[] }>("manage-products", {
          action: "list",
          ...creatorCreds(),
        }),
        invokeApi<{ purchases: {
          id: string;
          status: string;
          amount: number;
          created_at: string;
          product_id: string;
          simple_user_id: string;
          assigned_teacher_id: string | null;
          can_choose_teacher: boolean | null;
          is_trial?: boolean | null;
          trial_ends_at?: string | null;
          access_expires_at?: string | null;
          user: { id: string; name: string; phone: string } | null;
          latest_submission?: { id: string; verification_status: string } | null;
          receipts?: BuyerPurchase["receipts"];
          subscription?: BuyerPurchase["subscription"];
        }[] }>("manage-products", {
          action: "list_purchases",
          ...creatorCreds(),
        }),
      ]);

      const products = productsRes.products ?? [];
      const purchasesData = purchasesRes.purchases ?? [];
      if (!purchasesData.length) return [];

      return purchasesData.map(purchase => ({
        ...purchase,
        simple_user: purchase.user || { id: "", name: "Unknown", phone: "" },
        product: products.find(p => p.id === purchase.product_id) || { title: "Unknown" },
        receipts: purchase.receipts ?? [],
        subscription: purchase.subscription ?? null,
      })) as PurchaseWithUser[];
    },
    enabled: !!creatorName,
  });

  // Получить учителей для продуктов автора
  const { data: teachersMap = {} } = useQuery({
    queryKey: ["creator-product-teachers", creatorName],
    queryFn: async () => {
      if (!creatorName) return {};

      const [productsRes, teachersRes] = await Promise.all([
        invokeApi<{ products: { id: string }[] }>("manage-products", {
          action: "list",
          ...creatorCreds(),
        }),
        invokeApi<{ teachers: { product_id: string; teacher_name: string }[] }>("manage-products", {
          action: "list_creator_teachers",
          ...creatorCreds(),
        }),
      ]);

      const products = productsRes.products ?? [];
      const productTeachers = teachersRes.teachers ?? [];
      if (!products.length || !productTeachers.length) return {};

      const productIds = products.map(p => p.id);
      const schedulesRes = await invokeApi<{ schedules: { teacher_id: string | null }[] }>("manage-schedules", {
        action: "list_schedules",
        ...creatorCreds(),
        productIds,
      });
      const teacherIds = [...new Set((schedulesRes.schedules ?? []).map((s) => s.teacher_id).filter(Boolean))] as string[];
      const { users: teacherUsers } = teacherIds.length
        ? await invokeApi<{ users: { id: string; name: string }[] }>("manage-products", {
            action: "list_users_by_ids",
            ...creatorCreds(),
            ids: teacherIds,
          })
        : { users: [] as { id: string; name: string }[] };

      const map: Record<string, Teacher[]> = {};
      productTeachers.forEach(pt => {
        if (!map[pt.product_id]) map[pt.product_id] = [];
        const teacher = teacherUsers?.find(t => t.name === pt.teacher_name);
        if (teacher && !map[pt.product_id].some(t => t.id === teacher.id)) {
          map[pt.product_id].push(teacher);
        }
      });

      return map;
    },
    enabled: !!creatorName,
  });

  const setAccess = async (purchaseId: string, mode: "forever" | "until" | "revoke", until?: Date) => {
    if (purchaseId.startsWith("demo-")) {
      toast.success(t("buyerAccessSaved"));
      return;
    }
    await invokeApi("manage-products", {
      action: "set_purchase_access",
      ...creatorCreds(),
      purchaseId,
      mode,
    });
    await queryClient.invalidateQueries({ queryKey: ["creator-purchases"] });
  };

  // Мутация для изменения назначенного учителя
  const updateTeacherAssignment = useMutation({
    mutationFn: async ({ purchaseId, teacherId, canChoose }: { purchaseId: string; teacherId: string | null; canChoose: boolean }) => {
      await invokeApi("manage-products", {
        action: "update_purchase",
        ...creatorCreds(),
        purchaseId,
        updates: {
          assigned_teacher_id: teacherId,
          can_choose_teacher: canChoose,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-purchases"] });
      toast.success(language === "ru" ? "Расписание изменено" : "Кесте өзгертілді");
    },
    onError: () => {
      toast.error(language === "ru" ? "Ошибка при изменении" : "Өзгерту қатесі");
    },
  });

  // Обработчик выбора учителя
  const handleTeacherChange = (purchaseId: string, value: string) => {
    if (purchaseId.startsWith("demo-")) {
      toast.success(language === "ru" ? "Расписание изменено" : "Кесте өзгертілді");
      return;
    }
    if (value === "author") {
      updateTeacherAssignment.mutate({ purchaseId, teacherId: null, canChoose: false });
    } else if (value === "choose") {
      updateTeacherAssignment.mutate({ purchaseId, teacherId: null, canChoose: true });
    } else {
      updateTeacherAssignment.mutate({ purchaseId, teacherId: value, canChoose: false });
    }
  };

  // Получить текущее значение для Select
  const getCurrentValue = (purchase: PurchaseWithUser) => {
    if (purchase.can_choose_teacher) return "choose";
    const teachers = teachersMap[purchase.product_id] || [];
    if (!purchase.assigned_teacher_id || !teachers.some(t => t.id === purchase.assigned_teacher_id)) return "author";
    return purchase.assigned_teacher_id;
  };

  // Paid buyers, plus those whose access the seller closed (so it can be opened again).
  const filtered = useMemo(() => {
    const from = periodStart(period);
    const q = searchQuery.trim().toLowerCase();
    return purchases.filter((p) => {
      if (p.status !== "completed" && p.status !== "revoked") return false;
      if (!showAll && p.product_id !== selectedProductId) return false;
      if (from && new Date(p.created_at) < from) return false;
      if (!q) return true;
      return p.simple_user.name.toLowerCase().includes(q) || p.simple_user.phone.includes(q);
    });
  }, [purchases, period, searchQuery, showAll, selectedProductId]);

  const opened = purchases.find((p) => p.id === openId) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">{t("users")}</h2>
      <CreatorPendingPayments creatorName={creatorName} />

      {creatorProducts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0 sm:flex-initial">
              <ProductSwitcher
                products={creatorProducts.map((p) => ({ id: p.id, title: p.title }))}
                selectedId={selectedProductId}
                onChange={(id) => {
                  setSelectedProductId(id);
                  setAllProducts(false);
                }}
                inactive={showAll}
                className={cn(
                  "w-full sm:w-auto h-9 min-h-0 text-xs sm:text-sm md:h-10 md:min-h-10 md:text-sm rounded-lg hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
                  showAll && "opacity-60"
                )}
              />
            </div>
            {creatorProducts.length >= 2 && (
              <button
                type="button"
                onClick={() => setAllProducts((v) => !v)}
                aria-pressed={showAll}
                className={cn(
                  "shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs sm:text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] h-9 min-h-0 md:h-10 md:min-h-10",
                  showAll
                    ? "border-primary bg-primary text-white hover:bg-primary/90 hover:text-white"
                    : "border-input bg-background text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
                )}
              >
                <Layers className={cn("w-4 h-4 shrink-0 transition-colors", showAll ? "text-white" : "text-primary")} />
                <span>{t("buyersAllProducts")}</span>
              </button>
            )}
          </div>

          {/* When they bought: this month by default. */}
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist" aria-label={t("buyersPeriod")}>
            {BUYER_PERIODS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={period === key}
                onClick={() => setPeriod(key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                  period === key
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
                )}
              >
                {t(`buyersPeriod_${key}` as "buyersPeriod_month")}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder={t("searchUsers")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{t("paidUsers")}</h3>
          <span className="text-sm text-muted-foreground">{filtered.length} {t("total")}</span>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("noPaidUsers")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {period === "all" ? t("usersWillAppear") : t("buyersTryLongerPeriod")}
            </p>
          </div>
        )}

        {filtered.map((purchase, index) => (
          <Card
            key={purchase.id}
            role="button"
            tabIndex={0}
            className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/40 focus-ring"
            style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
            onClick={() => setOpenId(purchase.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenId(purchase.id);
              }
            }}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-success">
                    {purchase.simple_user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-foreground truncate">{purchase.simple_user.name}</h4>
                  <p className="mt-0.5 flex min-w-0 text-xs text-muted-foreground">
                    {showAll && (
                      <>
                        <span className="truncate">{purchase.product.title}</span>
                        <span className="shrink-0">&nbsp;·&nbsp;</span>
                      </>
                    )}
                    <span className="shrink-0 text-success">{formatPriceTenge(Number(purchase.amount))}</span>
                  </p>
                </div>
                {/* Access status sits in the middle of the card's height, next to the arrow. */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <UrgencyBadge purchase={purchase} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <BuyerDetailsDialog
        purchase={opened}
        onOpenChange={(open) => !open && setOpenId(null)}
        onSetAccess={setAccess}
        teachers={opened ? teachersMap[opened.product_id] || [] : []}
        teacherValue={opened ? getCurrentValue(opened) : "author"}
        onTeacherChange={(value) => opened && handleTeacherChange(opened.id, value)}
      />
    </div>
  );
};

export default CreatorUsersTab;
