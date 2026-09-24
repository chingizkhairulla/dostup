import { useState } from "react";
import { Share2, Copy, MessageCircle, Send } from "lucide-react";
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
};

const ShareProductButton = ({
  title,
  id,
  slug,
  sellerHandle,
  className,
  size = "sm",
  variant = "outline",
}: ShareProductButtonProps) => {
  const { t, language, l } = useLanguage();
  const [open, setOpen] = useState(false);
  const shareUrl = buildProductShareUrl({ id, slug }, sellerHandle);
  const canNativeShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, url: shareUrl });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(l({ ru: "Не удалось открыть шаринг", kk: "Бөлісу ашылмады", en: "Could not open sharing" }));
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(l({ ru: "Ссылка скопирована!", kk: "Сілтеме көшірілді!", en: "Link copied!" }));
      setOpen(false);
    } catch {
      toast.error(l({ ru: "Не удалось скопировать", kk: "Көшіру сәтсіз", en: "Could not copy" }));
    }
  };

  const fallbackActions = (
  <PopoverContent align="end" className="w-52 p-2">
    <div className="flex flex-col gap-1">
      <Button variant="ghost" size="sm" className="justify-start" onClick={handleCopy}>
        <Copy className="mr-2 h-4 w-4" />
        {l({ ru: "Скопировать", kk: "Көшіру", en: "Copy" })}
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

  if (canNativeShare) {
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
