import { useState } from "react";
import { Flag, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Translated } from "@/lib/language";

// The reason is sent in Russian whatever the reader's language: it is read by
// moderators, whose dashboard is Russian-only. Only the label is translated.
const REPORT_REASONS: { value: string; label: Translated }[] = [
  { value: "Мошенничество или обман", label: { ru: "Мошенничество или обман", kk: "Алаяқтық немесе алдау", en: "Fraud or deception" } },
  { value: "Нарушение авторских прав", label: { ru: "Нарушение авторских прав", kk: "Авторлық құқықты бұзу", en: "Copyright infringement" } },
  {
    value: "Несоответствие описанию / некачественный контент",
    label: {
      ru: "Несоответствие описанию / некачественный контент",
      kk: "Сипаттамаға сәйкес келмейді / сапасыз контент",
      en: "Not as described / poor-quality content",
    },
  },
  {
    value: "Запрещенный или оскорбительный материал",
    label: { ru: "Запрещенный или оскорбительный материал", kk: "Тыйым салынған немесе қорлайтын материал", en: "Prohibited or offensive material" },
  },
  { value: "Спам или ввод в заблуждение", label: { ru: "Спам или ввод в заблуждение", kk: "Спам немесе жаңылыстыру", en: "Spam or misleading" } },
  { value: "Другая причина", label: { ru: "Другая причина", kk: "Басқа себеп", en: "Other reason" } },
];

interface ReportProductDialogProps {
  productId: string;
  productTitle: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "icon";
  className?: string;
}

export const ReportProductDialog = ({
  productId,
  productTitle,
  variant = "ghost",
  size = "sm",
  className,
}: ReportProductDialogProps) => {
  const { user } = useSimpleAuth();
  const { l } = useLanguage();
  const [open, setOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0].value);
  const [description, setDescription] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      toast.error(l({ ru: "Пожалуйста, выберите причину жалобы", kk: "Шағым себебін таңдаңыз", en: "Please choose a reason" }));
      return;
    }

    setSubmitting(true);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${baseUrl}/functions/v1/support-api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          action: "report_product",
          product_id: productId,
          reason: selectedReason,
          description: description.trim() || undefined,
          reporter_name: user?.name || undefined,
          reporter_contact: reporterContact.trim() || undefined,
          user_id: user?.id || undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || "report_failed");
      }

      toast.success(
        l({
          ru: "Жалоба отправлена. Модераторы проверят этот продукт.",
          kk: "Шағым жіберілді. Модераторлар бұл өнімді тексереді.",
          en: "Report sent. Moderators will review this product.",
        }),
      );
      setOpen(false);
      setDescription("");
      setReporterContact("");
      setSelectedReason(REPORT_REASONS[0].value);
    } catch (err: any) {
      console.error("Report error:", err);
      // The server answers with technical codes, so the reader gets a sentence instead.
      toast.error(l({ ru: "Не удалось отправить жалобу", kk: "Шағымды жіберу мүмкін болмады", en: "Could not send the report" }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          title={l({ ru: "Пожаловаться на продукт", kk: "Өнімге шағымдану", en: "Report this product" })}
        >
          <Flag className="w-3.5 h-3.5 text-muted-foreground mr-1.5" />
          <span className="text-xs text-muted-foreground hover:text-foreground">
            {l({ ru: "Пожаловаться", kk: "Шағымдану", en: "Report" })}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {l({ ru: "Пожаловаться на продукт", kk: "Өнімге шағымдану", en: "Report this product" })}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {l({
                ru: `Если курс или продукт «${productTitle}» нарушает правила или законы, сообщите нам.`,
                kk: `Егер «${productTitle}» курсы немесе өнімі ережелерді не заңдарды бұзса, бізге хабарлаңыз.`,
                en: `If the course or product “${productTitle}” breaks the rules or the law, let us know.`,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <label className="text-xs font-semibold text-foreground block">
              {l({ ru: "Причина жалобы", kk: "Шағым себебі", en: "Reason" })}
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {REPORT_REASONS.map(({ value: r, label }) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    selectedReason === r
                      ? "border-primary bg-primary/5 font-medium text-foreground"
                      : "border-border hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="report_reason"
                    checked={selectedReason === r}
                    onChange={() => setSelectedReason(r)}
                    className="text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span>{l(label)}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-foreground block">
                {l({ ru: "Подробности (необязательно)", kk: "Толығырақ (міндетті емес)", en: "Details (optional)" })}
              </label>
              <Textarea
                placeholder={l({
                  ru: "Опишите подробнее, что не так с продуктом...",
                  kk: "Өнімде не дұрыс емес екенін толығырақ сипаттаңыз...",
                  en: "Describe what is wrong with the product...",
                })}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground block">
                {l({ ru: "Контакт для связи (необязательно)", kk: "Байланыс деректері (міндетті емес)", en: "Contact details (optional)" })}
              </label>
              <Input
                placeholder={l({ ru: "Номер телефона или email", kk: "Телефон нөмірі немесе email", en: "Phone number or email" })}
                value={reporterContact}
                onChange={(e) => setReporterContact(e.target.value)}
                className="text-xs rounded-xl h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-xl"
            >
              {l({ ru: "Отмена", kk: "Болдырмау", en: "Cancel" })}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-white rounded-xl"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  {l({ ru: "Отправка...", kk: "Жіберілуде...", en: "Sending..." })}
                </>
              ) : (
                l({ ru: "Отправить жалобу", kk: "Шағым жіберу", en: "Send report" })
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReportProductDialog;
