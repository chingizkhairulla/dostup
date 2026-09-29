import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Check, Loader2, UserX, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatPriceTenge } from "@/lib/catalog";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import CreatorPendingPayments from "./CreatorPendingPayments";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PurchaseWithUser {
  id: string;
  status: string;
  amount: number;
  created_at: string;
  product_id: string;
  assigned_teacher_id: string | null;
  can_choose_teacher: boolean | null;
  simple_user: {
    id: string;
    name: string;
    phone: string;
  };
  product: {
    title: string;
  };
  latest_submission?: {
    id: string;
    verification_status: string;
  } | null;
}

interface Teacher {
  id: string;
  name: string;
}

interface CreatorUsersTabProps {
  creatorName: string;
  highlightPurchaseId?: string;
}

const CreatorUsersTab = ({ creatorName, highlightPurchaseId }: CreatorUsersTabProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [revokeDialog, setRevokeDialog] = useState<{ id: string; name: string } | null>(null);
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

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
          user: { id: string; name: string; phone: string } | null;
          latest_submission?: { id: string; verification_status: string } | null;
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
        product: products.find(p => p.id === purchase.product_id) || { title: "Unknown" }
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

  // Мутация для отзыва доступа
  const revokeAccess = useMutation({
    mutationFn: async (purchaseId: string) => {
      await invokeApi("manage-products", {
        action: "update_purchase",
        ...creatorCreds(),
        purchaseId,
        updates: { status: "revoked" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creator-purchases"] });
      toast.success(t("accessRevoked") || "Доступ закрыт");
      setRevokeDialog(null);
    },
    onError: () => {
      toast.error("Ошибка при закрытии доступа");
    },
  });

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

  const completedPurchases = purchases.filter(p => p.status === "completed");

  const filteredCompleted = completedPurchases.filter(
    (p) =>
      p.simple_user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.simple_user.phone.includes(searchQuery)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">{t("users")}</h2>
      <CreatorPendingPayments creatorName={creatorName} highlightPurchaseId={highlightPurchaseId} />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder={t("searchUsers") || "Поиск пользователей..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12"
        />
      </div>

      {/* Confirmed Users Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("paidUsers")}</h2>
          <span className="text-sm text-muted-foreground">{filteredCompleted.length} {t("total") || "всего"}</span>
        </div>

        {filteredCompleted.length === 0 && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("noPaidUsers")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("usersWillAppear")}</p>
          </div>
        )}

        {filteredCompleted.map((purchase, index) => {
          const productTeachers = teachersMap[purchase.product_id] || [];
          const hasTeachers = productTeachers.length > 0;

          return (
            <Card 
              key={purchase.id} 
              className="animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-success">
                      {purchase.simple_user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-medium text-foreground truncate">{purchase.simple_user.name}</h3>
                      <Check className="w-3 h-3 text-success flex-shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {purchase.product.title} · <span className="text-success">{formatPriceTenge(Number(purchase.amount))}</span>
                    </p>
                    
                    {/* Выбор учителя */}
                    {hasTeachers && (
                      <div className="mt-2 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <Select
                          value={getCurrentValue(purchase)}
                          onValueChange={(value) => handleTeacherChange(purchase.id, value)}
                        >
                          <SelectTrigger className="h-7 text-xs flex-1 max-w-[180px]">
                            <SelectValue placeholder={language === "ru" ? "Расписание" : "Кесте"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="author">
                              {language === "ru" ? "Автор" : "Автор"}
                            </SelectItem>
                            {productTeachers.map((teacher) => (
                              <SelectItem key={teacher.id} value={teacher.id}>
                                {teacher.name}
                              </SelectItem>
                            ))}
                            <SelectItem value="choose">
                              {language === "ru" ? "Выбирает сам" : "Өзі таңдайды"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                    onClick={() => setRevokeDialog({ id: purchase.id, name: purchase.simple_user.name })}
                    title={t("revokeAccess") || "Закрыть доступ"}
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revoke Access Confirmation Dialog */}
      <AlertDialog open={!!revokeDialog} onOpenChange={() => setRevokeDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeAccessTitle") || "Закрыть доступ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("revokeAccessDescription") || "Вы уверены, что хотите закрыть доступ пользователю"} <strong>{revokeDialog?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeDialog && revokeAccess.mutate(revokeDialog.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeAccess.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {t("revokeAccess") || "Закрыть доступ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CreatorUsersTab;
