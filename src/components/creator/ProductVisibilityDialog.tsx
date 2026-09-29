import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUpdateProduct } from "@/hooks/useProducts";

export type VisibilityProduct = {
  id: string;
  title: string;
  is_published?: boolean;
};

const TEXT = {
  ru: {
    title: "Выставить продукт",
    toggle: "На маркетплейс",
    privateWarning:
      "Перед публикацией добавьте необходимые материалы и/или расписание. Иначе после оплаты покупатель может получить доступ к продукту, в котором пока нет содержимого.",
    publishedInfo:
      "Продукт опубликован на маркетплейсе. Пользователи могут увидеть его, приобрести и получить доступ к добавленным вами материалам и/или расписанию.",
    publishedToast: "Продукт опубликован на маркетплейсе",
    privateToast: "Продукт скрыт с маркетплейса",
    error: "Не удалось изменить видимость",
  },
  kk: {
    title: "Өнімді жариялау",
    toggle: "Маркетплейске",
    privateWarning:
      "Жарияламас бұрын қажетті материалдарды және/немесе кестені қосыңыз. Әйтпесе төлемнен кейін сатып алушы әлі мазмұны жоқ өнімге қол жеткізуі мүмкін.",
    publishedInfo:
      "Өнім маркетплейсте жарияланды. Пайдаланушылар оны көріп, сатып алып, сіз қосқан материалдарға және/немесе кестеге қол жеткізе алады.",
    publishedToast: "Өнім маркетплейсте жарияланды",
    privateToast: "Өнім маркетплейстен жасырылды",
    error: "Көрінуді өзгерту мүмкін болмады",
  },
} as const;

type ProductVisibilityDialogProps = {
  product: VisibilityProduct | null;
  onOpenChange: (open: boolean) => void;
};

const ProductVisibilityDialog = ({ product, onOpenChange }: ProductVisibilityDialogProps) => {
  const { language } = useLanguage();
  const tx = TEXT[language === "kk" ? "kk" : "ru"];
  const updateProduct = useUpdateProduct();
  // Optimistic local value so the switch reflects the change immediately.
  const [published, setPublished] = useState(Boolean(product?.is_published));

  useEffect(() => {
    setPublished(Boolean(product?.is_published));
  }, [product?.id, product?.is_published]);

  const busy = updateProduct.isPending;

  const handleToggle = async (next: boolean) => {
    if (!product || busy) return;
    const previous = published;
    setPublished(next);
    try {
      await updateProduct.mutateAsync({ id: product.id, is_published: next });
      toast.success(next ? tx.publishedToast : tx.privateToast);
    } catch {
      setPublished(previous);
      toast.error(tx.error);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(open) => { if (!busy) onOpenChange(open); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{tx.title}</DialogTitle>
          <DialogDescription className="line-clamp-2">{product?.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
            <Label htmlFor="product-visibility-switch" className="min-w-0 text-sm font-semibold text-foreground cursor-pointer">
              {tx.toggle}
            </Label>
            <div className="flex items-center gap-2 shrink-0">
              {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                id="product-visibility-switch"
                checked={published}
                disabled={busy}
                onCheckedChange={(checked) => void handleToggle(checked)}
              />
            </div>
          </div>

          {published ? (
            <p className="text-sm text-muted-foreground">{tx.publishedInfo}</p>
          ) : (
            <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" aria-hidden="true" />
              <p>{tx.privateWarning}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductVisibilityDialog;
