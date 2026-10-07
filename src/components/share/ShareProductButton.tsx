import { useState } from "react";
import { AlertTriangle, Share2, Copy, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  buildProductShareUrl,
  whatsAppShareUrl,
  telegramShareUrl,
} from "@/lib/productShare";
import { toast } from "sonner";

type ShareProductButtonProps = {
  title: string;
  id: string;
  slug?: string | null;
  sellerHandle?: string | null;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost";
  /** Shown at the top of the share popover; forces the popover even where native sharing exists. */
  warning?: string;
};

const ShareProductButton = ({
  title,
  id,
  slug,
  sellerHandle,
  className,
  size = "sm",
  variant = "outline",
  warning,
}: ShareProductButtonProps) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const shareUrl = buildProductShareUrl({ id, slug }, sellerHandle);
  const canNativeShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, url: shareUrl });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(language === "ru" ? "Не удалось открыть шаринг" : "Бөлісу ашылмады");
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(language === "ru" ? "Ссылка скопирована!" : "Сілтеме көшірілді!");
      setOpen(false);
    } catch {
      toast.error(language === "ru" ? "Не удалось скопировать" : "Көшіру сәтсіз");
    }
  };

  const fallbackActions = (
  <PopoverContent align="end" className={warning ? "w-[min(18rem,calc(100vw-2rem))] p-2" : "w-52 p-2"}>
    {warning && (
      <div className="mb-2 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs leading-relaxed text-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
        <p>{warning}</p>
      </div>
    )}
    <div className="flex flex-col gap-1">
      {warning && canNativeShare && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => {
            setOpen(false);
            void handleNativeShare();
          }}
        >
          <Share2 className="mr-2 h-4 w-4" />
          {language === "ru" ? "Поделиться через…" : "Бөлісу…"}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="justify-start" onClick={handleCopy}>
        <Copy className="mr-2 h-4 w-4" />
        {language === "ru" ? "Скопировать" : "Көшіру"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start"
        onClick={() => {
          window.open(whatsAppShareUrl(title, shareUrl), "_blank", "noopener,noreferrer");
          setOpen(false);
        }}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        WhatsApp
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start"
        onClick={() => {
          window.open(telegramShareUrl(title, shareUrl), "_blank", "noopener,noreferrer");
          setOpen(false);
        }}
      >
        <Send className="mr-2 h-4 w-4" />
        Telegram
      </Button>
    </div>
  </PopoverContent>
  );

  if (canNativeShare && !warning) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={handleNativeShare}
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="ml-1">{t("shareProduct")}</span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          <Share2 className="h-3.5 w-3.5" />
          <span className="ml-1">{t("shareProduct")}</span>
        </Button>
      </PopoverTrigger>
      {fallbackActions}
    </Popover>
  );
};

export default ShareProductButton;
