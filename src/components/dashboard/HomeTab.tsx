import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, addHours, isBefore, isAfter } from "date-fns";
import { ru, kk } from "date-fns/locale";
import {
  useSimplePurchases,
  useSimpleSubscriptions,
  useSimpleBookings,
  useSimpleMaterials,
} from "@/hooks/useSimplePurchases";
import { useAnnouncementsForProducts } from "@/hooks/useAnnouncements";
import { useCatalogPreview, useCatalogProductsByIds } from "@/hooks/useCatalogSearch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import CatalogGrid from "@/components/marketplace/CatalogGrid";
import AnnouncementView from "@/components/dashboard/AnnouncementView";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { readLastOpenedMaterial, readRecentProductIds } from "@/lib/buyerActivity";
import {
  Calendar,
  ExternalLink,
  GraduationCap,
  Loader2,
  Play,
} from "lucide-react";

interface HomeTabProps {
  onBrowseCourses?: () => void;
}

const HomeTab = ({ onBrowseCourses }: HomeTabProps) => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { user } = useSimpleAuth();
  const locale = language === "kk" ? kk : ru;

  const { data: purchases = [], isLoading: purchasesLoading } = useSimplePurchases();
  const { data: subscriptions = [], isLoading: subsLoading } = useSimpleSubscriptions();
  const { data: bookings = [], isLoading: bookingsLoading } = useSimpleBookings();
  const { data: materials = [] } = useSimpleMaterials();

  const subscriptionProductIds = useMemo(
    () => new Set(subscriptions.filter((s) => s.has_access).map((s) => s.product_id)),
    [subscriptions],
  );

  const accessiblePurchases = useMemo(() => {
    const oneTime = purchases.filter(
      (p) =>
        !subscriptionProductIds.has(p.product_id) &&
        p.status !== "rejected" &&
        p.status !== "revoked"
    );
    const fromSubs = subscriptions
      .filter((s) => s.has_access && s.product)
      .map((s) => ({
        id: s.id,
        product_id: s.product_id,
        product: s.product,
        created_at: s.current_period_start,
      }));
    return [...oneTime, ...fromSubs];
  }, [purchases, subscriptions, subscriptionProductIds]);

  const productIds = useMemo(
    () => [...new Set(accessiblePurchases.map((p) => p.product_id))],
    [accessiblePurchases],
  );

  const { data: announcements = [], isLoading: annLoading } = useAnnouncementsForProducts(productIds);
  const recentIds = user ? readRecentProductIds(user.id) : [];
  const catalog = useCatalogProductsByIds(productIds);

  const myProducts = useMemo(() => {
    const byId = new Map((catalog.data ?? []).map((product) => [product.id, product]));
    const purchaseStatusByProductId = new Map(
      accessiblePurchases.map((p) => [p.product_id, (p as any).status || "completed"])
    );
    const ordered = [...accessiblePurchases].sort((a, b) => {
      const aIdx = recentIds.indexOf(a.product_id);
      const bIdx = recentIds.indexOf(b.product_id);
      if (aIdx !== -1 || bIdx !== -1) {
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return ordered
      .map((purchase) => {
        const prod = byId.get(purchase.product_id);
        if (!prod) return null;
        return {
          ...prod,
          purchaseStatus: purchaseStatusByProductId.get(purchase.product_id) || "completed",
        };
      })
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
  }, [accessiblePurchases, catalog.data, recentIds]);

  const nextLesson = useMemo(() => {
    const now = new Date();
    const horizon = addHours(now, 48);
    const upcoming = (bookings ?? [])
      .filter((b) => b.time_slot?.date && b.time_slot?.start_time)
      .map((b) => {
        const start = parseISO(`${b.time_slot!.date}T${b.time_slot!.start_time}`);
        return { booking: b, start };
      })
      .filter(({ start }) => isAfter(start, now) && isBefore(start, horizon))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return upcoming[0] ?? null;
  }, [bookings]);

  const lastMaterial = user ? readLastOpenedMaterial(user.id) : null;
  const continueProgress = useMemo(() => {
    if (!lastMaterial) return 0;
    if (typeof lastMaterial.progressPercent === "number") {
      return Math.min(100, Math.max(0, lastMaterial.progressPercent));
    }
    const inProduct = materials
      .filter((m) => m.product_id === lastMaterial.productId && m.type !== "folder")
      .sort((a, b) => a.order_index - b.order_index);
    if (!inProduct.length) return 0;
    const index = inProduct.findIndex((m) => m.id === lastMaterial.materialId);
    if (index < 0) return 0;
    return Math.round(((index + 1) / inProduct.length) * 100);
  }, [lastMaterial, materials]);

  const flatAnnouncements = useMemo(() => {
    return [...announcements]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 8);
  }, [announcements]);

  const loading =
    purchasesLoading ||
    subsLoading ||
    bookingsLoading ||
    annLoading ||
    (productIds.length > 0 && catalog.isLoading);
  const showLesson = Boolean(nextLesson);
  const showContinue = Boolean(lastMaterial);
  const showProducts = myProducts.length > 0;
  const showAnnouncements = flatAnnouncements.length > 0;
  const allEmpty = !showLesson && !showContinue && !showProducts && !showAnnouncements;
  const popular = useCatalogPreview(allEmpty && !loading, 4);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (allEmpty) {
    const suggested = popular.data ?? [];
    return (
      <div className="py-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground">
            {language === "ru"
              ? "Пока ничего не куплено — начните с каталога"
              : "Әзірге ештеңе сатып алынбады — каталогтан бастаңыз"}
          </p>
          {onBrowseCourses && (
            <Button onClick={onBrowseCourses}>{t("browseCourses")}</Button>
          )}
        </div>

        {(popular.isLoading || suggested.length > 0) && (
          <section className="mt-12">
            <h2 className="mb-6 text-lg font-semibold text-foreground">{t("popular")}</h2>
            {popular.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <CatalogGrid products={suggested} />
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {nextLesson && (
        <section>
          <Card className="overflow-hidden border-[#FF6B00]/30 bg-gradient-to-br from-[#FF6B00]/10 to-background">
            <CardContent className="space-y-4 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#FF6B00]">
                {t("nextLesson")}
              </p>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {nextLesson.booking.product?.title || nextLesson.booking.schedule?.title}
                </h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(nextLesson.start, "d MMMM, HH:mm", { locale })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap className="h-4 w-4" />
                    {nextLesson.booking.schedule?.teacher_name || t("author")}
                  </span>
                </div>
              </div>
              {nextLesson.booking.time_slot?.lesson_link ? (
                <Button asChild className="w-full sm:w-auto">
                  <a
                    href={nextLesson.booking.time_slot.lesson_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("joinLesson")}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate("/dashboard/schedule")}>
                  {t("schedule")}
                </Button>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {lastMaterial && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">{t("continueLearning")}</h2>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Play className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{lastMaterial.materialTitle}</p>
                <p className="truncate text-sm text-muted-foreground">{lastMaterial.productTitle}</p>
                <Progress value={continueProgress} className="mt-2 h-1.5" />
              </div>
              <Button size="sm" onClick={() => navigate("/dashboard/materials")}>
                {t("continue")}
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {showProducts && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">{t("myProducts")}</h2>
          <CatalogGrid products={myProducts} />
        </section>
      )}

      {flatAnnouncements.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">{t("announcements")}</h2>
          <div className="space-y-2">
            {flatAnnouncements.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <AnnouncementView html={a.content_html} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default HomeTab;
