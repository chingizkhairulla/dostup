import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCheckoutProduct, useProductPaymentMethods } from "@/hooks/useProducts";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProductPaymentMethodsList } from "@/components/checkout/ProductPaymentMethodsList";

import { ArrowLeft, Lock, Loader2, ExternalLink } from "lucide-react";
import BackArrowButton from "@/components/ui/BackArrowButton";
import { supabase } from "@/integrations/supabase/client";
import { formatPriceTenge } from "@/lib/catalog";
import { toast } from "sonner";
import heroBackground from "@/assets/hero-background.jpg";

const CheckoutPage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { data: product, isLoading } = useCheckoutProduct(productId);
  const { data: paymentMethods = [], isLoading: paymentMethodsLoading } = useProductPaymentMethods(productId || product?.id, true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleContinueAfterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !name) {
      toast.error("Заполните все поля");
      return;
    }

    setIsProcessing(true);

    try {
      // Create a secure signup token via edge function
      const { data, error } = await supabase.functions.invoke('create-signup-token', {
        body: { 
          email: email.trim(), 
          name: name.trim(),
          productId: productId || product?.id 
        }
      });

      if (error) {
        console.error('Error creating signup token:', error);
        toast.error("Произошла ошибка");
        setIsProcessing(false);
        return;
      }

      if (!data?.token) {
        toast.error("Произошла ошибка");
        setIsProcessing(false);
        return;
      }

      // Navigate with secure token instead of raw state
      navigate(`/setup-password?token=${data.token}`);
    } catch (err) {
      console.error('Error:', err);
      toast.error("Произошла ошибка");
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayProduct = product || {
    title: "Цифровой продукт",
    headline: "Получите доступ к премиум-контенту",
    price: 49000,
    image_url: heroBackground,
  };

  const isPaused = Boolean((product as any)?.is_paused);
  const pausedMessage: string =
    ((product as any)?.paused_message && String((product as any).paused_message).trim()) ||
    (language === "kk"
      ? "Автор осы сілтемені уақытша өшірді."
      : "Автор отключил ссылку.");

  if (product && isPaused) {
    return (
      <div className="min-h-screen bg-muted/30 py-6 px-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <BackArrowButton onClick={() => navigate(-1)} label={t("back")} />
          </div>
          <Card className="animate-fade-in">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{displayProduct.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl bg-muted/60 border border-border px-4 py-4 text-center text-sm text-foreground whitespace-pre-wrap">
                {pausedMessage}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header with back and language */}
        <div className="flex items-center justify-between mb-4">
          <BackArrowButton onClick={() => navigate(-1)} label={t("back")} />
        </div>

        {/* Order Summary */}
        <Card className="mb-6 animate-fade-in">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t("orderSummary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-foreground">{displayProduct.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{displayProduct.headline}</p>
              </div>
              <span className="text-lg font-bold text-foreground">
                {formatPriceTenge(Number(displayProduct.price))}
              </span>
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-between">
              <span className="font-semibold">{t("orderSummary")}</span>
              <span className="text-xl font-bold text-primary">
                {formatPriceTenge(Number(displayProduct.price))}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Checkout Form */}
        <Card className="animate-fade-in" style={{ animationDelay: "100ms" }}>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="w-4 h-4 text-success" />
              {t("secureCheckout")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleContinueAfterPayment} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              {/* Payment Methods */}
              <div className="space-y-4">
                {paymentMethodsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ProductPaymentMethodsList
                    methods={paymentMethods}
                    disabled={!email || !name}
                  />
                )}

                <Button 
                  type="submit" 
                  variant="outline" 
                  size="lg" 
                  className="w-full mt-2"
                  disabled={isProcessing || !email || !name || paymentMethods.length === 0}
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

              <p className="text-xs text-center text-muted-foreground mt-4">
                {t("termsAgreement")}
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CheckoutPage;