import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const CANCELLATION_REASONS = {
  plans_changed: { ru: "Изменились планы", kk: "Жоспарлар өзгерді" },
  felt_unwell: { ru: "Стало плохо", kk: "Жаман болды" },
  family: { ru: "Семейные обстоятельства", kk: "Отбасылық жағдайлар" },
  schedule_changed: { ru: "Поменялся график", kk: "Кестем өзгерді" },
  reschedule: { ru: "Хочу перенести запись", kk: "Жазбаны ауыстырғым келеді" },
};

export type CancellationReasonKey = keyof typeof CANCELLATION_REASONS;

interface CancellationReasonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reasons: string[], comment: string) => void;
  isPending?: boolean;
  title?: string;
  description?: string;
}

const CancellationReasonDialog = ({
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  title,
  description,
}: CancellationReasonDialogProps) => {
  const { language, l } = useLanguage();
  const [selectedReasons, setSelectedReasons] = useState<CancellationReasonKey[]>([]);
  const [comment, setComment] = useState("");

  const handleReasonToggle = (reason: CancellationReasonKey) => {
    setSelectedReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };

  const handleConfirm = () => {
    const reasonTexts = selectedReasons.map(
      (key) => CANCELLATION_REASONS[key][l({ ru: "ru", kk: "kk", en: "ru" })]
    );
    onConfirm(reasonTexts, comment.trim());
  };

  const handleClose = () => {
    setSelectedReasons([]);
    setComment("");
    onClose();
  };

  const defaultTitle = l({ ru: "Отменить запись?", kk: "Жазбадан бас тарту?", en: "Cancel this booking?" });
  const defaultDescription =
    l({ ru: "Пожалуйста, укажите причину отмены", kk: "Бас тарту себебін көрсетіңіз", en: "Please give a reason for cancelling" });

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title || defaultTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {description || defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {(Object.keys(CANCELLATION_REASONS) as CancellationReasonKey[]).map(
            (key) => (
              <label
                key={key}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selectedReasons.includes(key)}
                  onCheckedChange={() => handleReasonToggle(key)}
                />
                <span className="text-sm">
                  {CANCELLATION_REASONS[key][l({ ru: "ru", kk: "kk", en: "ru" })]}
                </span>
              </label>
            )
          )}

          <div className="pt-2">
            <Textarea
              placeholder={
                l({ ru: "Дополнительный комментарий", kk: "Қосымша түсініктеме", en: "Extra comment" })
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            {l({ ru: "Назад", kk: "Артқа", en: "Back" })}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending || (selectedReasons.length === 0 && comment.trim().length === 0)}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {l({ ru: "Отменить запись", kk: "Жазбадан бас тарту", en: "Cancel the booking" })}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CancellationReasonDialog;
