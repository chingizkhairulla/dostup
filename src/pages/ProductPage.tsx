import { Link, useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useEffect, useState, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ShareProductButton from "@/components/share/ShareProductButton";
import { ReportProductDialog } from "@/components/marketplace/ReportProductDialog";
import { isUuid } from "@/lib/productShare";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import ProductCover from "@/components/marketplace/ProductCover";
import PublicContainer from "@/components/marketplace/PublicContainer";
import PublicFooter from "@/components/layout/PublicFooter";
import ProductVideoPlayer, { preloadVideoBlob } from "@/components/media/ProductVideoPlayer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useProduct, useProductProgram, type ProductProgramItem } from "@/hooks/useProducts";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { formatPriceTenge, formatCatalogPrice, isBillingPeriod } from "@/lib/catalog";
import { touchRecentProduct } from "@/lib/buyerActivity";
import { sellerInitial } from "@/lib/productCover";
import { invokeApi } from "@/lib/sessionApi";
import { rememberAuthNext } from "@/lib/creatorAuth";
import { loginPath, loginState } from "@/lib/loginModal";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Folder, Loader2, Play, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { parseMarkdownToHtml } from "@/components/ui/RichTextEditor";

function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  const hasHtml = /<[a-z][\s\S]*>/i.test(html);
  const formatted = hasHtml ? html : parseMarkdownToHtml(html);
  return DOMPurify.sanitize(formatted, {
    ADD_TAGS: [
      "b", "strong", "i", "em", "u", "s", "strike", "br", "p", "span",
      "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "code", "pre", "blockquote"
    ],
    ADD_ATTR: ["style", "href", "target", "class", "rel"],
  });
}

function renderSafeFormattedContent(text: string | null | undefined) {
  if (!text) return null;

  const lines = text.split("\n");
  return (
    <div className="whitespace-pre-wrap break-words space-y-1">
      {lines.map((line, idx) => {
        if (!line.trim() && line === "") {
          return <div key={idx} className="h-3" aria-hidden="true" />;
        }
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <div key={idx} className="min-h-[1.4em]">
            {parts.map((part, pIdx) => {
              if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
                return (
                  <strong key={pIdx} className="font-bold text-foreground">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return part;
            })}
          </div>
        );
      })}
    </div>
  );
}

function getOptionDisplay(opt: any) {
  const priceStr = formatPriceTenge(Number(opt.price));
  if (opt.payment_type === "one_time") {
    return `${priceStr} (разово)`;
  }
  let periodStr = "в месяц";
  if (opt.recurring_interval === "7d") periodStr = "каждые 7 дней";
  else if (opt.recurring_interval === "14d") periodStr = "каждые 14 дней";
  else if (opt.recurring_interval === "1m") periodStr = "в месяц";
  else if (opt.recurring_interval === "3m") periodStr = "каждые 3 месяца";
  else if (opt.recurring_interval === "1y") periodStr = "в год";
  else if (opt.recurring_interval === "custom") periodStr = `каждые ${opt.access_duration_days || 30} дн.`;
  return `${priceStr} / ${periodStr}`;
}

const ProgramTree = ({ items, parentId }: { items: ProductProgramItem[]; parentId: string | null }) => {
  const children = items
    .filter((item) => (item.parent_id ?? null) === parentId)
    .sort((a, b) => a.order_index - b.order_index);
  if (children.length === 0) return null;

  return (
    <ul className="space-y-2">
      {children.map((item) => {
        const isFolder = item.type === "folder";
        return (
          <li key={item.id}>
            <div className="flex items-start gap-2 public-body text-foreground">
              {isFolder ? (
                <Folder className="mt-1 h-4 w-4 shrink-0 text-[#6B7280]" />
              ) : (
                <FileText className="mt-1 h-4 w-4 shrink-0 text-[#6B7280]" />
              )}
              <span>{item.title}</span>
            </div>
            {isFolder && (
              <div className="ml-6 mt-2">
                <ProgramTree items={items} parentId={item.id} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const BuyButton = ({
  disabled,
  pausedMessage,
  onClick,
  label,
}: {
  disabled: boolean;
  pausedMessage: string;
  onClick: () => void;
  label: string;
}) => {
  if (disabled) {
    return (
      <div className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-3 text-center text-sm text-foreground whitespace-pre-wrap">
        {pausedMessage}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-2xl bg-[#FF6B00] px-6 text-base font-semibold text-white focus-ring hover:bg-[#E86000]"
    >
      {label}
    </button>
  );
};

const ProductPage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { user, profileType, profiles, switchProfile } = useSimpleAuth();
  const { data: product, isLoading } = useProduct(productId);
  const { data: program = [] } = useProductProgram(product?.id);
  const [switchBuyerOpen, setSwitchBuyerOpen] = useState(false);
  const [switchingBuyer, setSwitchingBuyer] = useState(false);

  const isSellerProfile = profileType === "creator" || profileType === "school";

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const activeOption = useMemo(() => {
    if (!product?.pricing_options || product.pricing_options.length === 0) return null;
    if (selectedOptionId) {
      const found = product.pricing_options.find((o: any) => o.id === selectedOptionId);
      if (found) return found;
    }
    return product.pricing_options[0];
  }, [product?.pricing_options, selectedOptionId]);

  const effectivePrice = activeOption ? Number(activeOption.price) : Number(product?.price || 0);
  const effectiveHasTrial = activeOption ? Boolean(activeOption.has_free_trial) : Boolean(product?.has_free_trial);
  const effectiveTrialDays = activeOption ? activeOption.trial_days : product?.trial_days;

  const checkoutUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (searchParams.get("teacher")) {
      params.set("teacher", searchParams.get("teacher")!);
    }
    if (activeOption?.id) {
      params.set("option", activeOption.id);
    }
    const q = params.toString();
    return `/checkout/${product?.id || ""}${q ? `?${q}` : ""}`;
  }, [product?.id, searchParams, activeOption?.id]);

  const handleBuy = () => {
    if (isSellerProfile) {
      setSwitchBuyerOpen(true);
      return;
    }
    navigate(checkoutUrl);
  };

  const switchToBuyerAndBuy = async () => {
    setSwitchingBuyer(true);
    const buyer = profiles.find((p) => p.type === "buyer");
    const result = buyer
      ? await switchProfile({ profileId: buyer.id })
      : await switchProfile({ createType: "buyer" });
    setSwitchingBuyer(false);
    if ("error" in result) {
      toast.error(t("switchProfileError"));
      return;
    }
    setSwitchBuyerOpen(false);
    navigate(checkoutUrl);
  };

  const [activatingTrial, setActivatingTrial] = useState(false);
  const queryClient = useQueryClient();
  const location = useLocation();

  const { data: trialInfo } = useQuery({
    queryKey: ["check-trial", product?.id, user?.id],
    queryFn: async () => {
      if (!user || !product?.id) return null;
      return invokeApi<{
        hasFreeTrial: boolean;
        hasUsedTrial: boolean;
        canUseTrial: boolean;
        trialDays: number | null;
        trialEndsAt: string | null;
      }>("checkout", {
        action: "check_trial",
        productId: product.id,
        sessionToken: localStorage.getItem("creator_token") || "",
      });
    },
    enabled: Boolean(user && product?.id && (effectiveHasTrial || product?.has_free_trial)),
  });

  const handleActivateTrial = async () => {
    if (!user) {
      toast.error(t("loginRequiredCheckout") || "Для активации необходимо войти");
      const next = `/p/${product?.slug || product?.id}`;
      rememberAuthNext(next);
      navigate(loginPath(next), { state: loginState(location) });
      return;
    }
    if (isSellerProfile) {
      toast.info("Переключитесь на профиль покупателя");
      setSwitchBuyerOpen(true);
      return;
    }
    setActivatingTrial(true);
    try {
      const res = await invokeApi<{ ok: boolean; trialEndsAt: string; message?: string }>("checkout", {
        action: "activate_trial",
        productId: product?.id,
        sessionToken: localStorage.getItem("creator_token") || "",
      });
      if (res.ok) {
        toast.success(`Пробный период на ${effectiveTrialDays || product?.trial_days} дн. активирован!`);
        queryClient.invalidateQueries({ queryKey: ["simple-purchases"] });
        queryClient.invalidateQueries({ queryKey: ["check-trial", product?.id] });
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast.error(err?.message || "Пробный период уже был использован");
    } finally {
      setActivatingTrial(false);
    }
  };

  useEffect(() => {
    if (!product?.slug || !productId) return;
    if (isUuid(productId) && product.slug !== productId) {
      navigate(`/p/${encodeURIComponent(product.slug)}${window.location.search}`, { replace: true });
    }
  }, [product?.slug, productId, navigate]);

  useEffect(() => {
    if (!user?.id || !product?.id) return;
    touchRecentProduct(user.id, product.id);
  }, [user?.id, product?.id]);

  const productMedia: Array<{ type: "image" | "video"; url: string }> = useMemo(() => {
    if (Array.isArray((product as any)?.media) && (product as any).media.length > 0) {
      return (product as any).media;
    }
    const list: Array<{ type: "image" | "video"; url: string }> = [];
    if (product?.image_url) list.push({ type: "image", url: product.image_url });
    if (product?.video_url) list.push({ type: "video", url: product.video_url });
    return list;
  }, [product]);

  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  // Фоновая предзагрузка всех видео продукта для мгновенного старта
  useEffect(() => {
    productMedia.forEach((m) => {
      if (m.type === "video" && m.url) {
        preloadVideoBlob(m.url);
      }
    });
  }, [productMedia]);

  const buyerSessionToken = localStorage.getItem("creator_token") || "";

  const reviewsQuery = useQuery({
    queryKey: ["product-reviews", product?.id, buyerSessionToken],
    queryFn: () =>
      invokeApi<{
        reviews: Array<{
          id: string;
          rating: number;
          comment: string | null;
          created_at: string;
          buyer_display_name: string | null;
          buyer_avatar_url: string | null;
        }>;
        avgRating: number;
        reviewCount: number;
        myReview: { rating: number; comment: string | null } | null;
        canReview: boolean;
      }>("manage-reviews", { action: "list", productId: product?.id ?? "", sessionToken: buyerSessionToken }),
    enabled: Boolean(product?.id),
  });

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewFormTouched, setReviewFormTouched] = useState(false);

  useEffect(() => {
    if (reviewsQuery.data?.myReview && !reviewFormTouched) {
      setReviewRating(reviewsQuery.data.myReview.rating);
      setReviewComment(reviewsQuery.data.myReview.comment || "");
    }
  }, [reviewsQuery.data?.myReview, reviewFormTouched]);

  const submitReview = useMutation({
    mutationFn: () =>
      invokeApi("manage-reviews", {
        action: "upsert",
        productId: product?.id ?? "",
        rating: reviewRating,
        comment: reviewComment,
        sessionToken: buyerSessionToken,
      }),
    onSuccess: () => {
      toast.success(t("reviewsThanks"));
      setReviewFormTouched(false);
      queryClient.invalidateQueries({ queryKey: ["product-reviews", product?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.message || t("reviewsError"));
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <MarketplaceHeader />
        <div className="flex flex-1 justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <MarketplaceHeader />
        <PublicContainer className="flex-1 py-6">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-2 public-meta hover:text-foreground focus-ring rounded-md"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t("back")}</span>
          </Link>
          <p className="public-body text-[#6B7280]">{t("productNotFound")}</p>
        </PublicContainer>
        <PublicFooter />
      </div>
    );
  }

  const videoUrl = product.video_url;

  const handleMediaTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleMediaTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setActiveMediaIdx((prev) => (prev > 0 ? prev - 1 : productMedia.length - 1));
      } else {
        setActiveMediaIdx((prev) => (prev < productMedia.length - 1 ? prev + 1 : 0));
      }
    }
  };
  const faq = Array.isArray(product.faq)
    ? product.faq.filter((it) => it && (it.question || it.answer))
    : [];
  const isPaused = Boolean(product.is_paused);
  const pausedMessage: string =
    (product.paused_message && String(product.paused_message).trim()) || t("productPausedDefault");
  const sellerName = product.author_name || t("author");
  const isEffectiveSubscription = activeOption
    ? activeOption.payment_type === "recurring"
    : (product.category_slug === "subscriptions" || product.payment_type === "recurring");
  const effectiveAccessLabel = isEffectiveSubscription
    ? t("subscriptionAccessNote")
    : (activeOption?.access_duration_days || product.access_duration_days)
      ? t("accessDays", { days: activeOption?.access_duration_days || product.access_duration_days })
      : t("accessLifetime");
  const firstChargeDate = new Intl.DateTimeFormat(language === "kk" ? "kk-KZ" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const priceLabel = formatPriceTenge(effectivePrice);

  const sellerBlock = product.seller_handle ? (
    <Link
      to={`/s/${encodeURIComponent(product.seller_handle)}`}
      className="flex items-center gap-3 rounded-md focus-ring"
    >
      <Avatar className="h-10 w-10">
        {product.seller_avatar_url && (
          <AvatarImage src={product.seller_avatar_url} alt="" />
        )}
        <AvatarFallback>{sellerInitial(sellerName)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{sellerName}</span>
        <span className="public-meta">/s/{product.seller_handle}</span>
      </span>
    </Link>
  ) : (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10">
        <AvatarFallback>{sellerInitial(sellerName)}</AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium text-foreground">{sellerName}</span>
    </div>
  );

  const purchaseBody = (
    <>
      {product.pricing_options && product.pricing_options.length > 1 && (
        <div className="space-y-2 mb-4">
          <p className="text-xs font-semibold text-muted-foreground">Вариант доступа:</p>
          <div className="space-y-2">
            {product.pricing_options.map((opt: any) => {
              const isSelected = (activeOption?.id === opt.id);
              const summary = getOptionDisplay(opt);
              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedOptionId(opt.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                      : "border-border bg-card/60 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-foreground truncate">{summary}</span>
                    {opt.has_free_trial && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">
                        {opt.trial_days} дн. триал
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ml-2 transition-colors",
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-3xl font-bold tracking-tight text-foreground">
        {priceLabel}
      </p>
      {isEffectiveSubscription && (
        <p className="public-meta mt-2">
          {t("subscriptionFirstCharge")}: {firstChargeDate}
        </p>
      )}
      <p className="public-meta mt-2">{effectiveAccessLabel}</p>
      <div className="mt-6 border-t border-border pt-6">{sellerBlock}</div>
      <div className="mt-6">
        {effectiveHasTrial && effectiveTrialDays && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full mb-3 rounded-2xl border-primary/40 text-primary hover:bg-primary/10 font-semibold h-12 text-sm"
            disabled={isPaused || activatingTrial || trialInfo?.hasUsedTrial}
            onClick={handleActivateTrial}
          >
            {activatingTrial ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : trialInfo?.hasUsedTrial ? (
              "Пробный период уже использован"
            ) : (
              `Попробовать бесплатно (${effectiveTrialDays} ${effectiveTrialDays === 3 ? "дня" : "дней"})`
            )}
          </Button>
        )}
        <BuyButton
          disabled={isPaused}
          pausedMessage={pausedMessage}
          onClick={handleBuy}
          label={t("buy")}
        />
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketplaceHeader />
      <PublicContainer className="flex-1 pb-28 pt-4 lg:pb-16 lg:pt-6">
        <Link
          to="/"
          onClick={(e) => {
            if (window.history.state && window.history.state.idx > 0) {
              e.preventDefault();
              window.history.back();
            }
          }}
          className="mb-4 inline-flex items-center gap-2 public-meta hover:text-foreground focus-ring rounded-md"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("back")}</span>
        </Link>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <div>
            <div className="space-y-3">
              <div
                className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-black/5"
                onTouchStart={productMedia.length > 1 ? handleMediaTouchStart : undefined}
                onTouchEnd={productMedia.length > 1 ? handleMediaTouchEnd : undefined}
              >
                {productMedia.length === 0 ? (
                  <ProductCover
                    productId={product.id}
                    title={product.title}
                    imageUrl={product.image_url}
                    decorative={false}
                    className="rounded-2xl"
                  />
                ) : productMedia[activeMediaIdx]?.type === "video" ? (
                  <ProductVideoPlayer
                    key={productMedia[activeMediaIdx].url}
                    src={productMedia[activeMediaIdx].url}
                    controls
                    playsInline
                    objectFit="contain"
                    className="w-full h-full"
                  />
                ) : (
                  <img
                    key={productMedia[activeMediaIdx]?.url}
                    src={productMedia[activeMediaIdx]?.url}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Стрелки переключения */}
                {productMedia.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveMediaIdx((prev) => (prev > 0 ? prev - 1 : productMedia.length - 1))}
                      className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all z-10"
                      title="Предыдущее"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMediaIdx((prev) => (prev < productMedia.length - 1 ? prev + 1 : 0))}
                      className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all z-10"
                      title="Следующее"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Точки-индикаторы снизу (как карточки вопросов) */}
              {productMedia.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 py-1">
                  {productMedia.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveMediaIdx(i)}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        i === activeMediaIdx
                          ? "w-4 bg-primary"
                          : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                      )}
                      title={`Медиа ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
              <h1 className="public-display text-foreground text-balance min-w-0 flex-1 whitespace-pre-wrap break-words">
                {renderSafeFormattedContent(product.title)}
              </h1>
              <div className="flex items-center gap-2 shrink-0">
                <ShareProductButton
                  title={product.title}
                  id={product.id}
                  slug={product.slug}
                  sellerHandle={product.seller_handle}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                />
                <ReportProductDialog
                  productId={product.id}
                  productTitle={product.title}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                />
              </div>
            </div>
            {product.headline && (
              <div className="public-body mt-3 text-foreground whitespace-pre-wrap break-words">
                {renderSafeFormattedContent(product.headline)}
              </div>
            )}
            {product.description && (
              <div
                className="prose prose-sm sm:prose-base max-w-none text-foreground/90 break-words mt-4
                  [&_strong]:text-foreground [&_strong]:font-bold
                  [&_h1]:text-foreground [&_h1]:font-bold [&_h1]:text-2xl [&_h1]:mt-6 [&_h1]:mb-3
                  [&_h2]:text-foreground [&_h2]:font-bold [&_h2]:text-xl [&_h2]:mt-5 [&_h2]:mb-2.5
                  [&_h3]:text-foreground [&_h3]:font-semibold [&_h3]:text-lg [&_h3]:mt-4 [&_h3]:mb-2
                  [&_p]:mb-3 [&_p]:leading-relaxed
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1
                  [&_li]:leading-relaxed
                  [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(product.description) }}
              />
            )}

            {program.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  {t("courseProgram")}
                </h2>
                <ProgramTree items={program} parentId={null} />
              </div>
            )}

            {product.has_schedule && (
              <p className="public-meta mt-8 rounded-2xl bg-[#F3F4F6] px-4 py-3">
                {t("productScheduleNote")}
              </p>
            )}

            {faq.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  {t("faqTitle")}
                </h2>
                <Accordion type="single" collapsible className="w-full">
                  {faq.map((item, idx) => (
                    <AccordionItem key={idx} value={`faq-${idx}`} className="border-border">
                      <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline whitespace-pre-wrap break-words text-base py-3.5">
                        {renderSafeFormattedContent(item.question)}
                      </AccordionTrigger>
                      <AccordionContent className="text-base text-foreground/85 leading-relaxed pt-1 pb-4">
                        {renderSafeFormattedContent(item.answer)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            <div className="mt-8">
              <h2 className="mb-4 text-lg font-semibold text-foreground">{t("reviewsTitle")}</h2>

              {(reviewsQuery.data?.reviewCount ?? 0) > 0 && (
                <div className="mb-4 flex items-center gap-2">
                  <Star className="h-5 w-5 fill-[#FFB020] text-[#FFB020]" />
                  <span className="text-lg font-bold text-foreground">
                    {reviewsQuery.data!.avgRating.toFixed(1)}
                  </span>
                  <span className="public-meta">
                    {t("reviewsCount", { count: reviewsQuery.data!.reviewCount })}
                  </span>
                </div>
              )}

              {reviewsQuery.data?.canReview && (
                <div className="mb-6 rounded-2xl border border-border p-4">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {reviewsQuery.data.myReview ? t("reviewsEdit") : t("reviewsWrite")}
                  </p>
                  <div className="mb-3 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => {
                          setReviewFormTouched(true);
                          setReviewRating(star);
                        }}
                        className="focus-ring rounded"
                        aria-label={String(star)}
                      >
                        <Star
                          className={cn(
                            "h-6 w-6",
                            star <= reviewRating ? "fill-[#FFB020] text-[#FFB020]" : "text-muted-foreground/40",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => {
                      setReviewFormTouched(true);
                      setReviewComment(e.target.value);
                    }}
                    placeholder={t("reviewsCommentPlaceholder")}
                    className="mb-3 min-h-[88px] w-full rounded-xl border border-border bg-transparent p-3 text-sm text-foreground placeholder:text-muted-foreground focus-ring"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={reviewRating === 0 || submitReview.isPending}
                    onClick={() => submitReview.mutate()}
                  >
                    {submitReview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("reviewsSubmit")}
                  </Button>
                </div>
              )}

              {reviewsQuery.data && !reviewsQuery.data.canReview && user && profileType === "buyer" && (
                <p className="mb-6 public-meta">{t("reviewsPurchaseRequired")}</p>
              )}

              {reviewsQuery.data && reviewsQuery.data.reviews.length === 0 ? (
                <p className="public-meta">{t("reviewsEmpty")}</p>
              ) : (
                <div className="space-y-4">
                  {reviewsQuery.data?.reviews.map((review) => (
                    <div key={review.id} className="border-b border-border pb-4 last:border-0">
                      <div className="mb-1 flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {review.buyer_avatar_url && <AvatarImage src={review.buyer_avatar_url} alt="" />}
                          <AvatarFallback className="text-[10px]">
                            {sellerInitial(review.buyer_display_name || "")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-foreground">
                          {review.buyer_display_name || t("author")}
                        </span>
                      </div>
                      <div className="mb-1 flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              "h-3.5 w-3.5",
                              star <= review.rating ? "fill-[#FFB020] text-[#FFB020]" : "text-muted-foreground/30",
                            )}
                          />
                        ))}
                      </div>
                      {review.comment && (
                        <p className="public-body whitespace-pre-wrap break-words text-foreground/90">
                          {review.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 lg:hidden">{sellerBlock}</div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6">
              {purchaseBody}
            </div>
          </aside>
        </div>
      </PublicContainer>

      <PublicFooter className="pb-28 lg:pb-0" />

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/90 p-3 backdrop-blur-lg safe-area-inset lg:hidden">
        <PublicContainer className="flex flex-col gap-2">
          {isPaused ? (
            <div className="w-full rounded-2xl border border-border bg-muted/60 px-4 py-3 text-center text-sm text-foreground whitespace-pre-wrap">
              {pausedMessage}
            </div>
          ) : (
            <>
              {product.has_free_trial && product.trial_days && !trialInfo?.hasUsedTrial && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl border-primary/40 text-primary font-medium"
                  disabled={activatingTrial}
                  onClick={handleActivateTrial}
                >
                  {activatingTrial ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    `Попробовать бесплатно (${product.trial_days} ${product.trial_days === 3 ? "дня" : "дней"})`
                  )}
                </Button>
              )}
              <div className="flex items-center gap-4">
                <p className="shrink-0 text-lg font-bold tabular-nums text-foreground">
                  {formatPriceTenge(Number(product.price))}
                </p>
                <button
                  type="button"
                  onClick={handleBuy}
                  className="h-12 min-w-0 flex-1 rounded-2xl bg-[#FF6B00] px-6 text-base font-semibold text-white focus-ring hover:bg-[#E86000]"
                >
                  {t("buy")}
                </button>
              </div>
            </>
          )}
        </PublicContainer>
      </div>

      <AlertDialog open={switchBuyerOpen} onOpenChange={setSwitchBuyerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("switchToBuyerTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("switchToBuyerDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switchingBuyer}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={switchingBuyer} onClick={() => void switchToBuyerAndBuy()}>
              {switchingBuyer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("switchToBuyerAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductPage;
