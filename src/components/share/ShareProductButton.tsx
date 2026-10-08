import { useRef, useState } from "react";
import { AlertTriangle, Check, Share2, Copy, Instagram, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildProductShareUrl, whatsAppShareUrl, telegramShareUrl } from "@/lib/productShare";
import { toast } from "sonner";

type ShareProductButtonProps = {
  title: string;
  id: string;
  slug?: string | null;
  sellerHandle?: string | null;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost";
  /** Предупреждение продавцу перед отправкой ссылки на продукт. */
  warning?: string;
};

const ShareProductButton = ({ title, id, slug, sellerHandle, className, size = "sm", variant = "outline", warning }: ShareProductButtonProps) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shareUrl = buildProductShareUrl({ id, slug }, sellerHandle);
  const canNativeShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  const handleCopy = async (message?: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(message || (language === "ru" ? "Ссылка скопирована!" : "Сілтеме көшірілді!"));
    } catch {
      toast.error(language === "ru" ? "Не удалось скопировать. Выделите и скопируйте ссылку." : "Көшіру сәтсіз. Сілтемені белгілеп, көшіріңіз.");
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) {
      await handleCopy(language === "ru" ? "Ссылка скопирована — вставьте её в нужное приложение" : "Сілтеме көшірілді — оны қажетті қолданбаға қойыңыз");
      return;
    }
    try {
      await navigator.share({ title, url: shareUrl });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(language === "ru" ? "Не удалось открыть меню. Скопируйте ссылку." : "Мәзір ашылмады. Сілтемені көшіріңіз.");
      }
    }
  };

  const handleInstagram = () => {
    // Instagram не принимает ссылку через веб-форму отправки: её можно вставить из буфера.
    void handleCopy(language === "ru" ? "Ссылка скопирована — вставьте её в Instagram" : "Сілтеме көшірілді — оны Instagram-ға қойыңыз");
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); setCopied(false); }}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t("shareProduct")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent hideCloseButton
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl gap-5 overflow-y-auto rounded-2xl p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="text-xl outline-none">{t("shareProduct")}</DialogTitle>
          <DialogDescription className="sr-only">
            {language === "ru" ? "Скопируйте ссылку или выберите приложение" : "Сілтемені көшіріңіз немесе қолданбаны таңдаңыз"}
          </DialogDescription>
        </DialogHeader>
        {warning && (
          <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-base leading-relaxed text-foreground">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <p>{warning}</p>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted/20 p-1.5 shadow-sm">
          <Input readOnly value={shareUrl} aria-label={language === "ru" ? "Ссылка на продукт" : "Өнімге сілтеме"}
            onFocus={(event) => event.currentTarget.select()} className="min-w-0 rounded-full border-0 bg-transparent shadow-none focus-visible:ring-1" />
          <Button type="button" variant="outline" className="shrink-0 rounded-full px-3 shadow-sm hover:bg-primary/10 hover:text-foreground" onClick={() => void handleCopy()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span aria-live="polite">{copied ? (language === "ru" ? "Скопировано" : "Көшірілді") : (language === "ru" ? "Скопировать" : "Көшіру")}</span>
          </Button>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          {language === "ru" ? "или" : "немесе"}
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Button type="button" className="rounded-full bg-black px-3 text-white hover:bg-black/80"
            onClick={() => void handleNativeShare()}>
            <Share2 aria-hidden="true" /> {language === "ru" ? "Другие" : "Басқалар"}
          </Button>
          <Button type="button" className="rounded-full bg-gradient-to-b from-[#2DD86D] to-[#17B956] px-3 text-white hover:brightness-95"
            onClick={() => window.open(whatsAppShareUrl(title, shareUrl), "_blank", "noopener,noreferrer")}>
            <MessageCircle aria-hidden="true" /> WhatsApp
          </Button>
          <Button type="button" className="rounded-full bg-gradient-to-b from-[#38B5E9] to-[#1598CF] px-3 text-white hover:brightness-95"
            onClick={() => window.open(telegramShareUrl(title, shareUrl), "_blank", "noopener,noreferrer")}>
            <Send aria-hidden="true" /> Telegram
          </Button>
          <Button type="button" className="rounded-full bg-[radial-gradient(circle_at_20%_100%,#FEDA75_0%,#FA7E1E_22%,#D62976_50%,#962FBF_75%,#4F5BD5_100%)] px-3 text-white hover:brightness-95"
            onClick={handleInstagram}>
            <Instagram aria-hidden="true" /> Instagram
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareProductButton;
