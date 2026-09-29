import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface RejectRescheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  isPending?: boolean;
}

const RejectRescheduleDialog = ({ isOpen, onClose, onConfirm, isPending }: RejectRescheduleDialogProps) => {
  const { language } = useLanguage();
  const [reasonType, setReasonType] = useState<"cant" | "custom">("cant");
  const [customComment, setCustomComment] = useState("");

  const defaultReason = language === "ru"
    ? "Не могу перенести"
    : "Ауыстыра алмаймын";

  const handleConfirm = () => {
    const comment = reasonType === "cant" ? defaultReason : customComment.trim();
    if (!comment) return;
    onConfirm(comment);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isPending) {
      onClose();
      setReasonType("cant");
      setCustomComment("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md dialog-mobile-fullscreen">
        <DialogHeader>
          <DialogTitle>
            {language === "ru" ? "Причина отклонения" : "Бас тарту себебі"}
          </DialogTitle>
        </DialogHeader>

        <RadioGroup value={reasonType} onValueChange={(v) => setReasonType(v as "cant" | "custom")} className="space-y-3">
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="cant" id="reject-cant" className="mt-0.5" />
            <Label htmlFor="reject-cant" className="text-sm leading-snug cursor-pointer">
              {language === "ru" ? "Не могу перенести" : "Ауыстыра алмаймын"}
            </Label>
          </div>
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="custom" id="reject-custom" className="mt-0.5" />
            <Label htmlFor="reject-custom" className="text-sm leading-snug cursor-pointer">
              {language === "ru" ? "Своя причина" : "Өз себебі"}
            </Label>
          </div>
        </RadioGroup>

        {reasonType === "custom" && (
          <Textarea
            value={customComment}
            onChange={(e) => setCustomComment(e.target.value)}
            placeholder={language === "ru" ? "Опишите причину..." : "Себебін жазыңыз..."}
            className="min-h-[80px]"
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {language === "ru" ? "Отмена" : "Бас тарту"}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending || (reasonType === "custom" && !customComment.trim())}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {language === "ru" ? "Отклонить" : "Қабылдамау"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RejectRescheduleDialog;
