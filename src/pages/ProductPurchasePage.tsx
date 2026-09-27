import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCheckoutProduct } from "@/hooks/useProducts";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

import { invokeApi, studentCreds } from "@/lib/sessionApi";
import { ArrowLeft, Lock, Loader2, ExternalLink, Clock, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import { rememberAuthNext } from "@/lib/creatorAuth";
import { loginPath, loginState } from "@/lib/loginModal";
import { formatPriceTenge } from "@/lib/catalog";
import ReceiptUploadCard, { ReceiptSubmission } from "@/components/checkout/ReceiptUploadCard";
import { cn } from "@/lib/utils";
import { resolvePaymentMethods, formatCardNumber } from "@/lib/paymentMethods";

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
// Push notifications are now sent from the server via database triggers

const formatKaspiPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 10) {
    return `+7 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  }
  return phone;
};

const ProductPurchasePage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { user, sessionToken } = useSimpleAuth();
  const { data: product, isLoading } = useCheckoutProduct(productId);
  
  // Получить параметры тарифа и учителя из URL
  const optionParam = searchParams.get("option");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(optionParam || null);

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

  const teacherParam = searchParams.get("teacher");
  const canChoose = teacherParam === "choice";
  
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(!!teacherParam && teacherParam !== "choice");
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<"form" | "pending" | "completed">("form");
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [receiptSubmission, setReceiptSubmission] = useState<ReceiptSubmission | null>(null);
  const [activatingTrial, setActivatingTrial] = useState(false);
  const [trialInfo, setTrialInfo] = useState<{
    hasFreeTrial: boolean;
    hasUsedTrial: boolean;
    canUseTrial: boolean;
    trialDays: number | null;
  } | null>(null);

  useEffect(() => {
    const checkTrial = async () => {
      if (!user || !productId) return;
      try {
        const token = sessionToken || localStorage.getItem("creator_token") || "";
        const res = await invokeApi<{
          hasFreeTrial: boolean;
          hasUsedTrial: boolean;
          canUseTrial: boolean;
          trialDays: number | null;
        }>("checkout", {
          action: "check_trial",
          productId,
          sessionToken: token,
        });
        setTrialInfo(res);
      } catch {
        // ignore
      }
    };
    checkTrial();
  }, [user, productId, sessionToken]);

  const handleActivateTrial = async () => {
    if (!user || !productId) return;
    setActivatingTrial(true);
    try {
      const token = sessionToken || localStorage.getItem("creator_token") || "";
      const res = await invokeApi<{ ok: boolean; trialEndsAt: string; message?: string }>("checkout", {
        action: "activate_trial",
        productId,
        sessionToken: token,
      });
      if (res.ok) {
        toast.success(`Пробный период на ${effectiveTrialDays || product?.trial_days || trialInfo?.trialDays} дн. активирован!`);
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast.error(err?.message || "Пробный период уже был использован");
    } finally {
      setActivatingTrial(false);
    }
  };
  // Push notifications are now sent from the server via database triggers

  // Найти teacher_id по имени из URL
  useEffect(() => {
    const findTeacherId = async () => {
      if (!teacherParam || teacherParam === "choice" || !productId) {
        setTeacherLoading(false);
        return;
      }
      
      setTeacherLoading(true);
      
      const teacherName = decodeURIComponent(teacherParam);
      const data = await invokeApi<{ teacherId: string | null }>("checkout", {
        action: "lookup_teacher",
        productId,
        teacherName,
      });
      setTeacherId(data.teacherId);
      setTeacherLoading(false);
    };
    
    findTeacherId();
  }, [teacherParam, productId]);

  // Проверить статус покупки при загрузке
  useEffect(() => {
    const checkExistingPurchase = async () => {
      if (user && productId) {
        const token = sessionToken || localStorage.getItem("simple_session_token") || "";
        const result = await invokeApi<{
          purchase: { id: string; status: string; latest_submission?: ReceiptSubmission | null } | null
        }>("checkout", {
          action: "get_my_purchase",
          sessionToken: token,
          productId,
        });
        const data = result.purchase;

        if (data) {
          setPurchaseId(data.id);
          setReceiptSubmission(data.latest_submission ?? null);
          if (data.status === "completed") {
            setPurchaseStatus("completed");
            navigate("/dashboard");
          } else {
            setPurchaseStatus("pending");
          }
        }
      }
    };

    checkExistingPurchase();
  }, [user, productId, navigate]);

  // Poll pending purchase until the creator confirms (realtime is closed after RLS lockdown)
  useEffect(() => {
    if (purchaseStatus !== "pending" || !purchaseId) return;
    const token = sessionToken || localStorage.getItem("simple_session_token") || "";
    const tick = async () => {
      try {
        const result = await invokeApi<{
          purchase: { id: string; status: string; latest_submission?: ReceiptSubmission | null } | null
        }>("checkout", {
          action: "get_my_purchase",
          sessionToken: token,
          productId,
        });
        if (result.purchase?.latest_submission) {
          setReceiptSubmission(result.purchase.latest_submission);
        }
        if (result.purchase?.status === "completed") {
          setPurchaseStatus("completed");
          toast.success(t("accessGranted"));
          navigate("/dashboard");
        }
      } catch {
        /* retry */
      }
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [purchaseStatus, purchaseId, navigate, t, sessionToken, productId]);

  const payment = useMemo(
    () => resolvePaymentMethods(activeOption, product),
    [activeOption, product],
  );
  const activeKaspiLink = payment.link;
  const activeKaspiPhone = payment.phone;
  const activeKaspiCard = payment.card;

  const handleKaspiPayment = () => {
    if (!activeKaspiLink) return;
    window.open(activeKaspiLink, "_blank");
  };

  const copyToClipboard = async (value: string, successKey: "kaspiPhoneCopied" | "cardNumberCopied") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t(successKey));
    } catch {
      toast.error(value);
    }
  };

  const handleCopyKaspiPhone = () => {
    if (!activeKaspiPhone) return;
    void copyToClipboard(activeKaspiPhone, "kaspiPhoneCopied");
  };

  const handleCopyKaspiCard = () => {
    if (!activeKaspiCard) return;
    void copyToClipboard(activeKaspiCard, "cardNumberCopied");
  };

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Подождать загрузки teacherId если ещё грузится
    if (teacherLoading) {
      toast.error("Подождите, идёт загрузка...");
      return;
    }
    
    setIsProcessing(true);
    
    console.log("Creating purchase with teacherId:", teacherId, "canChoose:", canChoose);

    if (!user) {
      toast.error(t("loginRequiredCheckout"));
      const next = `/checkout/${product?.id || productId || ""}`;
      rememberAuthNext(next);
      navigate(loginPath(next), { state: loginState(location) });
      setIsProcessing(false);
      return;
    }

    const token = sessionToken || localStorage.getItem("creator_token") || "";
    try {
      const result = await invokeApi<{ purchase: { id: string; status: string } }>("checkout", {
        action: "create_purchase",
        sessionToken: token,
        productId: product?.id || productId,
        assignedTeacherId: teacherId,
        canChooseTeacher: canChoose,
      });
      const purchase = result.purchase;
      if (purchase.status === "completed") {
        setPurchaseStatus("completed");
        navigate("/dashboard");
        setIsProcessing(false);
        return;
      }
      setPurchaseId(purchase.id);
      setPurchaseStatus("pending");
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "";
      console.error("create_purchase failed", err);
      toast.error(message ? `Ошибка создания заказа: ${message}` : "Ошибка создания заказа");
    }
    setIsProcessing(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <MarketplaceHeader />
        <div className="flex flex-1 justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <MarketplaceHeader />
        <p className="flex-1 px-4 py-16 text-center text-muted-foreground">{t("productNotFound")}</p>
        <PublicFooter />
      </div>
    );
  }

  const hasKaspiLink = Boolean(activeKaspiLink);
  const hasKaspiPhone = Boolean(activeKaspiPhone);
  const hasKaspiCard = Boolean(activeKaspiCard);
  const hasPaymentMethod = payment.hasAny;
  const paymentMethodCount = [hasKaspiLink, hasKaspiPhone, hasKaspiCard].filter(Boolean).length;
  const buyerReady = Boolean(firstName.trim() && lastName.trim());
  const checkoutPath = `/checkout/${product.id}`;
  const goToLogin = () => {
    rememberAuthNext(checkoutPath);
    navigate(loginPath(checkoutPath), { state: loginState(location) });
  };

  const handleBackToPayment = async () => {
    // Удалить pending покупку чтобы можно было вернуться к оплате
    if (purchaseId) {
      const token = sessionToken || localStorage.getItem("simple_session_token") || "";
      await invokeApi("checkout", { action: "cancel_pending", sessionToken: token, purchaseId });
    }
    setPurchaseId(null);
    setPurchaseStatus("form");
    setReceiptSubmission(null);
  };

  // Показать страницу ожидания
  if (purchaseStatus === "pending") {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <div className="absolute top-4 left-4 z-20">
          <button
            onClick={handleBackToPayment}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t("back")}</span>
          </button>
        </div>



        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="w-full max-w-md text-center animate-fade-in">
            <CardContent className="pt-8 pb-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                {receiptSubmission?.verification_status === "manual_review"
                  ? t("receiptManualReviewTitle")
                  : receiptSubmission?.verification_status === "payment_qr_or_invoice"
                    ? t("receiptPayFirstTitle")
                    : t("uploadPaymentReceipt")}
              </h2>
              <p className="text-muted-foreground mb-6">
                {receiptSubmission?.verification_status === "manual_review"
                  ? t("receiptManualReviewBody")
                  : receiptSubmission?.verification_status === "payment_qr_or_invoice"
                    ? t("receiptPayFirstBody")
                    : t("uploadReceiptHint")}
              </p>

              {purchaseId && (
                <ReceiptUploadCard
                  purchaseId={purchaseId}
                  sessionToken={sessionToken || studentCreds().sessionToken}
                  expectedAmount={Number(product.price)}
                  submission={receiptSubmission}
                  onSubmitted={(result) => {
                    setReceiptSubmission(result.submission);
                    if (result.purchase_status === "completed" || result.verification_status === "confirmed") {
                      setPurchaseStatus("completed");
                      navigate("/dashboard");
                    }
                  }}
                />
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t("back")}</span>
          </button>
        </div>

        {/* Order Summary */}
        <Card className="mb-6 animate-fade-in">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t("orderSummary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-foreground">{product.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{product.headline}</p>
              </div>
              <span className="text-lg font-bold text-foreground">
                {formatPriceTenge(effectivePrice)}
              </span>
            </div>

            {product.pricing_options && product.pricing_options.length > 1 && (
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Выберите вариант тарифа:</p>
                <div className="space-y-2">
                  {product.pricing_options.map((opt: any) => {
                    const isSelected = activeOption?.id === opt.id;
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
          </CardContent>
        </Card>

        {/* Free trial card if product supports it */}
        {effectiveHasTrial && effectiveTrialDays && (
          <Card className="mb-6 border-primary/40 bg-primary/5 animate-fade-in">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Бесплатный пробный период на {effectiveTrialDays} {effectiveTrialDays === 3 ? "дня" : "дней"}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {trialInfo?.hasUsedTrial
                      ? "Вы уже использовали пробный период для этого продукта. Доступно только приобретение."
                      : "Получите полный доступ к продукту на весь пробный период бесплатно."}
                  </p>
                </div>
                {user && !trialInfo?.hasUsedTrial && (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 rounded-xl border-primary/50 text-primary hover:bg-primary/10 font-medium"
                    disabled={isProcessing || activatingTrial}
                    onClick={handleActivateTrial}
                  >
                    {activatingTrial ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      "Попробовать бесплатно"
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {!user ? (
          <Card className="animate-fade-in">
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">{t("loginRequiredCheckout")}</p>
              <Button type="button" variant="cta" className="w-full bg-[#FF6B00]" onClick={goToLogin}>
                {t("loginToContinuePurchase")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="animate-fade-in" style={{ animationDelay: "100ms" }}>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="w-4 h-4 text-success" />
                {t("secureCheckout")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitPurchase} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t("firstName")}</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder={t("firstNamePlaceholder")}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t("lastName")}</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder={t("lastNamePlaceholder")}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                  <p className="text-sm text-amber-800 font-medium">
                    {t("sendReceiptWarning")}
                  </p>
                </div>

                {hasPaymentMethod ? (
                  <div className="space-y-4">
                    {paymentMethodCount > 1 && (
                      <p className="text-xs font-semibold text-muted-foreground">{t("paymentMethodsHint")}</p>
                    )}
                    {hasKaspiLink && (
                      <Button
                        type="button"
                        onClick={handleKaspiPayment}
                        className="w-full h-14 bg-[#F14635] hover:bg-[#d63d2e] text-white font-semibold text-lg"
                        disabled={!buyerReady}
                      >
                        <span className="flex items-center gap-2">
                          {t("payWithKaspi")}
                          <ExternalLink className="w-5 h-5" />
                        </span>
                      </Button>
                    )}
                    {hasKaspiPhone && (
                      <div className="rounded-lg border border-[#F14635]/30 bg-[#F14635]/5 p-4 space-y-3">
                        <p className="text-sm text-foreground">
                          {t("transferPhoneInstruction", { bank: payment.bankLabel })}
                        </p>
                        <p className="text-xl font-bold text-center tracking-wide">
                          {formatKaspiPhone(String(activeKaspiPhone))}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={handleCopyKaspiPhone}
                          disabled={!buyerReady}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          {t("copyKaspiPhone")}
                        </Button>
                      </div>
                    )}
                    {hasKaspiCard && (
                      <div className="rounded-lg border border-[#F14635]/30 bg-[#F14635]/5 p-4 space-y-3">
                        <p className="text-sm text-foreground">
                          {t("transferCardInstruction", { bank: payment.bankLabel })}
                        </p>
                        <p className="text-xl font-bold text-center tracking-widest tabular-nums">
                          {formatCardNumber(activeKaspiCard)}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={handleCopyKaspiCard}
                          disabled={!buyerReady}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          {t("copyCardNumber")}
                        </Button>
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="outline"
                      size="lg"
                      className="w-full"
                      disabled={isProcessing || !firstName.trim() || !lastName.trim()}
                    >
                      {isProcessing ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t("processing")}
                        </span>
                      ) : (
                        t("paidContinue")
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="border border-input rounded-lg p-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground text-center">
                      {t("noPaymentMethod")}
                    </p>
                  </div>
                )}

                <p className="text-xs text-center text-muted-foreground mt-4">
                  {t("termsAgreement")}
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ProductPurchasePage;
