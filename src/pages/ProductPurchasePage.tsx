import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCheckoutProduct, useProductPaymentMethods } from "@/hooks/useProducts";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

import { invokeApi, studentCreds } from "@/lib/sessionApi";
import {
  ArrowLeft,
  Lock,
  Loader2,
  Clock,
  Sparkles,
  Upload,
  ImagePlus,
  FileText,
  CheckCircle2,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import PublicFooter from "@/components/layout/PublicFooter";
import { rememberAuthNext } from "@/lib/creatorAuth";
import { loginPath, loginState } from "@/lib/loginModal";
import { formatPriceTenge } from "@/lib/catalog";
import { ProductPaymentMethodsList } from "@/components/checkout/ProductPaymentMethodsList";
import {
  submitPaymentReceipt,
  convertHeicToJpegIfNeeded,
  MAX_RECEIPT_BYTES,
} from "@/lib/receiptUpload";
import { cn } from "@/lib/utils";
import BackArrowButton from "@/components/ui/BackArrowButton";

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

const ProductPurchasePage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user, sessionToken } = useSimpleAuth();
  const { data: product, isLoading } = useCheckoutProduct(productId);
  const { data: paymentMethods = [], isLoading: paymentMethodsLoading } = useProductPaymentMethods(
    product?.id || productId,
    Boolean(user)
  );

  // Selected tariff option from URL / default
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
  const isFree = effectivePrice <= 0;
  const effectiveHasTrial = activeOption ? Boolean(activeOption.has_free_trial) : Boolean(product?.has_free_trial);
  const effectiveTrialDays = activeOption ? activeOption.trial_days : product?.trial_days;

  const teacherParam = searchParams.get("teacher");
  const canChoose = teacherParam === "choice";

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(!!teacherParam && teacherParam !== "choice");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);

  // Receipt file state for initial submission
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-upload state for waiting state ("Прикрепить другой чек")
  const [showReupload, setShowReupload] = useState(false);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadPreview, setReuploadPreview] = useState<string | null>(null);
  const [isReuploading, setIsReuploading] = useState(false);
  const reuploadInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<"form" | "pending" | "completed" | "rejected">("form");
  const [purchaseId, setPurchaseId] = useState<string | null>(null);

  const [activatingTrial, setActivatingTrial] = useState(false);
  const [trialInfo, setTrialInfo] = useState<{
    hasFreeTrial: boolean;
    hasUsedTrial: boolean;
    canUseTrial: boolean;
    trialDays: number | null;
  } | null>(null);

  // Auto-select first payment method when loaded
  useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
      setSelectedPaymentMethodId(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentMethodId]);

  // Track checkout started in localStorage for returning notice on ProductPage
  useEffect(() => {
    if (productId && !isFree) {
      localStorage.setItem(`dostup_checkout_started_${productId}`, "true");
    }
  }, [productId, isFree]);

  // Clean previews on unmount
  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      if (reuploadPreview) URL.revokeObjectURL(reuploadPreview);
    };
  }, [receiptPreview, reuploadPreview]);

  // Check trial info
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
        toast.success(
          `Пробный период на ${effectiveTrialDays || product?.trial_days || trialInfo?.trialDays} дн. активирован!`
        );
        localStorage.removeItem(`dostup_checkout_started_${productId}`);
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast.error(err?.message || "Пробный период уже был использован");
    } finally {
      setActivatingTrial(false);
    }
  };

  // Lookup teacher id
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

  // Check existing purchase on load
  useEffect(() => {
    const checkExistingPurchase = async () => {
      if (user && productId) {
        const token = sessionToken || localStorage.getItem("simple_session_token") || localStorage.getItem("creator_token") || "";
        const result = await invokeApi<{
          purchase: { id: string; status: string; payment_method_id?: string | null } | null;
        }>("checkout", {
          action: "get_my_purchase",
          sessionToken: token,
          productId,
        });
        const data = result.purchase;

        if (data) {
          setPurchaseId(data.id);
          if (data.payment_method_id) {
            setSelectedPaymentMethodId(data.payment_method_id);
          }
          if (data.status === "completed") {
            setPurchaseStatus("completed");
            localStorage.removeItem(`dostup_checkout_started_${productId}`);
            navigate("/dashboard");
          } else if (data.status === "pending") {
            setPurchaseStatus("pending");
          } else if (data.status === "rejected") {
            setPurchaseStatus("rejected");
          }
        }
      }
    };
    checkExistingPurchase();
  }, [user, productId, sessionToken, navigate]);

  // Realtime subscription: unlock product in buyer's open app with no reload
  useEffect(() => {
    if (!productId || !user) return;

    const channel = supabase
      .channel(`buyer-purchase-realtime-${productId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "simple_purchases",
        },
        (payload: { new?: { id?: string; status?: string; product_id?: string; buyer_profile_id?: string; simple_user_id?: string } }) => {
          const rec = payload.new;
          if (!rec) return;

          const matches =
            (purchaseId && rec.id === purchaseId) ||
            (rec.product_id === (product?.id || productId) &&
              (rec.buyer_profile_id === user.id || rec.simple_user_id === user.id));

          if (!matches) return;

          if (rec.status === "completed") {
            setPurchaseStatus("completed");
            localStorage.removeItem(`dostup_checkout_started_${productId}`);
            toast.success(t("accessGranted") || "Доступ открыт!");
            queryClient.invalidateQueries({ queryKey: ["simple-purchases"] });
            queryClient.invalidateQueries({ queryKey: ["simple-materials"] });
            queryClient.invalidateQueries({ queryKey: ["checkout-product", productId] });
            navigate("/dashboard");
          } else if (rec.status === "rejected") {
            setPurchaseStatus("rejected");
            toast.error("Оплата не подтверждена. Продавец не нашёл ваш платёж.");
            queryClient.invalidateQueries({ queryKey: ["simple-purchases"] });
            queryClient.invalidateQueries({ queryKey: ["simple-materials"] });
            queryClient.invalidateQueries({ queryKey: ["checkout-product", productId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [productId, user, purchaseId, product?.id, queryClient, navigate, t]);

  // Poll pending purchase until seller confirms or rejects
  useEffect(() => {
    if (purchaseStatus !== "pending" || !purchaseId) return;
    const token = sessionToken || localStorage.getItem("simple_session_token") || localStorage.getItem("creator_token") || "";
    const tick = async () => {
      try {
        const result = await invokeApi<{
          purchase: { id: string; status: string } | null;
        }>("checkout", {
          action: "get_my_purchase",
          sessionToken: token,
          productId,
        });
        if (result.purchase?.status === "completed") {
          setPurchaseStatus("completed");
          localStorage.removeItem(`dostup_checkout_started_${productId}`);
          toast.success(t("accessGranted"));
          queryClient.invalidateQueries({ queryKey: ["simple-purchases"] });
          queryClient.invalidateQueries({ queryKey: ["simple-materials"] });
          navigate("/dashboard");
        } else if (result.purchase?.status === "rejected") {
          setPurchaseStatus("rejected");
        }
      } catch {
        /* retry */
      }
    };
    tick();
    const intervalId = window.setInterval(tick, 4000);
    return () => window.clearInterval(intervalId);
  }, [purchaseStatus, purchaseId, navigate, t, sessionToken, productId, queryClient]);

  const handleSelectFile = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error(t("receiptTooLarge"));
      return;
    }
    setReceiptFile(file);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    if (file.type.startsWith("image/") || file.name.match(/\.(heic|heif)$/i)) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  };

  const handleSelectReuploadFile = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error(t("receiptTooLarge"));
      return;
    }
    setReuploadFile(file);
    if (reuploadPreview) URL.revokeObjectURL(reuploadPreview);
    if (file.type.startsWith("image/") || file.name.match(/\.(heic|heif)$/i)) {
      setReuploadPreview(URL.createObjectURL(file));
    } else {
      setReuploadPreview(null);
    }
  };

  const handleReuploadSubmit = async () => {
    if (!reuploadFile || !purchaseId) return;
    setIsReuploading(true);
    try {
      const token = sessionToken || localStorage.getItem("simple_session_token") || localStorage.getItem("creator_token") || "";
      const result = await submitPaymentReceipt({
        file: reuploadFile,
        productId: product?.id || productId || "",
        paymentMethodId: selectedPaymentMethodId || "",
        sessionToken: token,
        purchaseId,
      });

      if (result.already_completed || result.purchaseStatus === "completed") {
        setPurchaseStatus("completed");
        localStorage.removeItem(`dostup_checkout_started_${productId}`);
        toast.success(t("accessGranted"));
        navigate("/dashboard");
        return;
      }

      setPurchaseStatus("pending");
      toast.success(t("receiptSentTitle"));
      setShowReupload(false);
      setReuploadFile(null);
      if (reuploadPreview) URL.revokeObjectURL(reuploadPreview);
      setReuploadPreview(null);
    } catch (err: any) {
      toast.error(err?.message || t("receiptUploadFailed"));
    } finally {
      setIsReuploading(false);
    }
  };

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (teacherLoading) {
      toast.error("Подождите, идёт загрузка...");
      return;
    }

    if (!user) {
      toast.error(t("loginRequiredCheckout"));
      const next = `/checkout/${product?.id || productId || ""}`;
      rememberAuthNext(next);
      navigate(loginPath(next), { state: loginState(location) });
      return;
    }

    const token = sessionToken || localStorage.getItem("simple_session_token") || localStorage.getItem("creator_token") || "";

    // 1. Free product flow: skips receipt submission entirely
    if (isFree) {
      setIsProcessing(true);
      try {
        const result = await invokeApi<{ purchase: { id: string; status: string } }>("checkout", {
          action: "create_purchase",
          sessionToken: token,
          productId: product?.id || productId,
          assignedTeacherId: teacherId,
          canChooseTeacher: canChoose,
        });
        if (result.purchase) {
          localStorage.removeItem(`dostup_checkout_started_${productId}`);
          setPurchaseStatus("completed");
          toast.success(t("accessGranted"));
          navigate("/dashboard");
        }
      } catch (err: any) {
        toast.error(err?.message || "Ошибка получения доступа");
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // 2. Paid product flow: create purchase row strictly upon receipt submission
    if (!receiptFile) {
      toast.error(t("receiptChooseFile"));
      return;
    }

    if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
      toast.error("Пожалуйста, выберите способ, которым вы оплатили");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await submitPaymentReceipt({
        file: receiptFile,
        productId: product?.id || productId || "",
        paymentMethodId: selectedPaymentMethodId || "",
        sessionToken: token,
        assignedTeacherId: teacherId,
        canChooseTeacher: canChoose,
      });

      localStorage.removeItem(`dostup_checkout_started_${productId}`);

      if (result.already_completed || result.purchaseStatus === "completed") {
        setPurchaseStatus("completed");
        toast.success(t("accessGranted"));
        navigate("/dashboard");
        return;
      }

      setPurchaseId(result.purchaseId);
      setPurchaseStatus("pending");
      toast.success(t("receiptSentTitle"));
    } catch (err: any) {
      console.error("Receipt submission error:", err);
      toast.error(err?.message || t("receiptUploadFailed"));
    } finally {
      setIsProcessing(false);
    }
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

  const checkoutPath = `/checkout/${product.id}`;
  const goToLogin = () => {
    rememberAuthNext(checkoutPath);
    navigate(loginPath(checkoutPath), { state: loginState(location) });
  };

  // Waiting State (Prompt 2 requirement)
  if (purchaseStatus === "pending") {
    return (
      <div className="min-h-screen bg-muted/20 flex flex-col">
        <MarketplaceHeader />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <Card className="w-full max-w-lg text-center animate-fade-in border shadow-sm">
            <CardContent className="pt-8 pb-8 px-6 space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                <Clock className="w-8 h-8 animate-pulse text-primary" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">
                  {t("receiptSentTitle")}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  {t("receiptSentBody")}
                </p>
              </div>

              {/* Link to attach another receipt */}
              <div>
                {!showReupload ? (
                  <button
                    type="button"
                    onClick={() => setShowReupload(true)}
                    className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5 focus-ring rounded"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t("attachAnotherReceipt")}</span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-dashed border-input bg-card p-4 space-y-3 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {t("attachAnotherReceipt")}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowReupload(false);
                          setReuploadFile(null);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <input
                      ref={reuploadInputRef}
                      type="file"
                      accept="image/*,application/pdf,.heic,.heif"
                      className="hidden"
                      onChange={(e) => handleSelectReuploadFile(e.target.files?.[0] || null)}
                    />

                    {reuploadPreview ? (
                      <div className="relative rounded-lg overflow-hidden border bg-background max-h-40 flex items-center justify-center">
                        <img src={reuploadPreview} alt="Receipt preview" className="max-h-40 object-contain" />
                      </div>
                    ) : reuploadFile ? (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border text-xs">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate font-medium">{reuploadFile.name}</span>
                      </div>
                    ) : null}

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-11 min-h-[44px] rounded-xl text-xs sm:text-sm font-medium"
                        onClick={() => reuploadInputRef.current?.click()}
                      >
                        <ImagePlus className="w-4 h-4 mr-2 shrink-0" />
                        <span className="truncate">{reuploadFile ? t("receiptChooseAnother") : t("receiptChooseFile")}</span>
                      </Button>
                      <Button
                        type="button"
                        className="flex-1 h-11 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold"
                        disabled={!reuploadFile || isReuploading}
                        onClick={handleReuploadSubmit}
                      >
                        {isReuploading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
                        ) : null}
                        <span>{t("uploadPaymentReceipt")}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => navigate("/dashboard")}
                >
                  Перейти в Дом
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <PublicFooter />
      </div>
    );
  }

  // Rejection State (Prompt 3 requirement)
  if (purchaseStatus === "rejected") {
    return (
      <div className="min-h-screen bg-muted/20 flex flex-col">
        <MarketplaceHeader />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <Card className="w-full max-w-lg text-center animate-fade-in border border-rose-200 dark:border-rose-900/50 shadow-sm">
            <CardContent className="pt-8 pb-8 px-6 space-y-6">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto text-rose-500">
                <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">
                  Оплата не подтверждена
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  Продавец не нашёл ваш платёж. Проверьте перевод или прикрепите другой чек.
                </p>
              </div>

              {/* Box to attach another receipt */}
              <div className="rounded-xl border border-dashed border-input bg-card p-5 space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    Прикрепить новый чек
                  </span>
                </div>

                <input
                  ref={reuploadInputRef}
                  type="file"
                  accept="image/*,application/pdf,.heic,.heif"
                  className="hidden"
                  onChange={(e) => handleSelectReuploadFile(e.target.files?.[0] || null)}
                />

                {reuploadPreview ? (
                  <div className="relative rounded-lg overflow-hidden border bg-background max-h-48 flex items-center justify-center">
                    <img src={reuploadPreview} alt="Receipt preview" className="max-h-48 object-contain" />
                  </div>
                ) : reuploadFile ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-xs">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate font-medium">{reuploadFile.name}</span>
                  </div>
                ) : (
                  <div
                    onClick={() => reuploadInputRef.current?.click()}
                    className="border border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/40 transition text-muted-foreground"
                  >
                    <ImagePlus className="w-8 h-8 mb-2 text-muted-foreground/60" />
                    <span className="text-xs font-medium">Нажмите, чтобы выбрать файл чека</span>
                    <span className="text-[11px] text-muted-foreground/80 mt-1">JPEG, PNG, WEBP или PDF до 10 МБ</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11 min-h-[44px] rounded-xl text-xs sm:text-sm font-medium"
                    onClick={() => reuploadInputRef.current?.click()}
                  >
                    <ImagePlus className="w-4 h-4 mr-2 shrink-0" />
                    <span className="truncate">{reuploadFile ? t("receiptChooseAnother") : t("receiptChooseFile")}</span>
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 h-11 min-h-[44px] rounded-xl text-xs sm:text-sm bg-primary text-primary-foreground font-semibold"
                    disabled={!reuploadFile || isReuploading}
                    onClick={handleReuploadSubmit}
                  >
                    {isReuploading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2 shrink-0" />
                    )}
                    <span>Отправить чек</span>
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => navigate("/dashboard")}
                >
                  Перейти в Дом
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <BackArrowButton onClick={() => navigate(-1)} label={t("back")} />
        </div>

        {/* Order Summary */}
        <Card className="mb-6 animate-fade-in shadow-2xs">
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
          <Card className="mb-6 border-primary/40 bg-primary/5 animate-fade-in shadow-2xs">
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
          <Card className="animate-fade-in shadow-2xs">
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">{t("loginRequiredCheckout")}</p>
              <Button type="button" variant="cta" className="w-full bg-[#FF6B00]" onClick={goToLogin}>
                {t("loginToContinuePurchase")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="animate-fade-in shadow-2xs" style={{ animationDelay: "100ms" }}>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="w-4 h-4 text-success" />
                {t("secureCheckout")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitPurchase} className="space-y-5">
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

                {!isFree && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-foreground">
                        {t("selectPaymentMethodUsed")}
                      </Label>
                      {paymentMethodsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <ProductPaymentMethodsList
                          methods={paymentMethods}
                          selectable={true}
                          selectedId={selectedPaymentMethodId}
                          onSelect={(id) => setSelectedPaymentMethodId(id)}
                          disabled={isProcessing}
                        />
                      )}
                    </div>

                    {/* Receipt file upload field */}
                    <div className="space-y-2 pt-2">
                      <Label className="text-sm font-semibold text-foreground">
                        Прикрепите чек об оплате
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("receiptAttachFileHint")}
                      </p>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf,.heic,.heif"
                        className="hidden"
                        onChange={(e) => handleSelectFile(e.target.files?.[0] || null)}
                      />

                      {receiptPreview ? (
                        <div className="relative rounded-2xl overflow-hidden border bg-background p-2">
                          <img
                            src={receiptPreview}
                            alt="Receipt preview"
                            className="w-full max-h-56 object-contain rounded-xl"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setReceiptFile(null);
                              setPreview(null);
                            }}
                            className="absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                            aria-label="Удалить чек"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : receiptFile ? (
                        <div className="flex items-center justify-between p-3 rounded-xl border bg-card gap-2">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <FileText className="w-5 h-5 text-primary shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {receiptFile.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {(receiptFile.size / (1024 * 1024)).toFixed(2)} МБ
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReceiptFile(null)}
                            className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                            aria-label="Удалить файл"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-card p-6 text-center cursor-pointer transition-colors space-y-2"
                        >
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                            <ImagePlus className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {t("receiptChooseFile")}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              JPEG, PNG, WEBP, GIF, PDF или фото с телефона
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-12 rounded-xl text-base font-semibold mt-4 shadow-sm"
                  disabled={
                    isProcessing ||
                    !firstName.trim() ||
                    !lastName.trim() ||
                    (!isFree && (!receiptFile || (paymentMethods.length > 0 && !selectedPaymentMethodId)))
                  }
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("processing")}
                    </span>
                  ) : isFree ? (
                    "Получить доступ бесплатно"
                  ) : (
                    t("uploadPaymentReceipt")
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-3">
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
