import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCheckoutProduct } from "@/hooks/useProducts";
import { useLanguage } from "@/contexts/LanguageContext";

import { ArrowLeft, Lock, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPriceTenge } from "@/lib/catalog";
import { toast } from "sonner";
import heroBackground from "@/assets/hero-background.jpg";

const CheckoutPage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { t, language, l } = useLanguage();
  const { data: product, isLoading } = useCheckoutProduct(productId);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleKaspiPayment = () => {
    if (!product?.kaspi_link) return;
    
    // Open Kaspi link in new tab
    window.open(product.kaspi_link, "_blank");
  };

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
    kaspi_link: null,
  };

  const hasKaspiLink = !!displayProduct.kaspi_link;

  const isPaused = Boolean((product as any)?.is_paused);
  const pausedMessage: string =
    ((product as any)?.paused_message && String((product as any).paused_message).trim()) ||
    (l({ ru: "Автор отключил ссылку.", kk: "Автор осы сілтемені уақытша өшірді.", en: "The author has disabled this link." }));

  if (product && isPaused) {
    return (
      <div className="min-h-screen bg-muted/30 py-6 px-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground touch-manipulation"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>{t("back")}</span>
            </button>
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

              {/* Kaspi Payment */}
              {hasKaspiLink ? (
                <div className="space-y-4">
                  <Button 
                    type="button"
                    onClick={handleKaspiPayment}
                    className="w-full h-14 bg-[#F14635] hover:bg-[#d63d2e] text-white font-semibold text-lg"
                    disabled={!email || !name}
                  >
                    <span className="flex items-center gap-2">
                      {t("payWithKaspi")}
                      <ExternalLink className="w-5 h-5" />
                    </span>
                  </Button>
                  
                  <p className="text-sm text-center text-muted-foreground">
                    {t("kaspiPaymentInfo")}
                  </p>

                  <Button 
                    type="submit" 
                    variant="outline" 
                    size="lg" 
                    className="w-full"
                    disabled={isProcessing || !email || !name}
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
      </div>
    </div>
  );
};

export default CheckoutPage;