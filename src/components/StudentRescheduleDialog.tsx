import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface StudentRescheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    newDate: string;
    newTime: string;
    reasons: string[];
    comment: string;
  }) => void;
  booking: {
    productTitle: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null;
  isPending?: boolean;
}

const StudentRescheduleDialog = ({
  isOpen,
  onClose,
  onConfirm,
  booking,
  isPending = false,
}: StudentRescheduleDialogProps) => {
  const { language } = useLanguage();
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reasonType, setReasonType] = useState<"cant_make_it" | "own">("cant_make_it");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (isOpen && booking) {
      setNewDate(booking.date);
      const [h, m] = (booking.startTime || "00:00").slice(0, 5).split(":").map(Number);
      const total = h * 60 + m + 60;
      const newH = Math.floor(total / 60) % 24;
      const newM = total % 60;
      setNewTime(`${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
      setReasonType("cant_make_it");
      setComment("");
    }
  }, [isOpen, booking]);

  const handleOpen = (open: boolean) => {
    if (!open) handleClose();
  };

  const handleClose = () => {
    setNewDate("");
    setNewTime("");
    setReasonType("cant_make_it");
    setComment("");
    onClose();
  };

  const handleConfirm = () => {
    const reasons: string[] = [];
    let finalComment = "";

    if (reasonType === "cant_make_it") {
      reasons.push(language === "ru" ? "Не успеваю" : "Үлгермеймін");
    } else {
      finalComment = comment.trim();
    }

    onConfirm({
      newDate,
      newTime: newTime + ":00",
      reasons,
      comment: finalComment,
    });
  };

  const isValid =
    newDate &&
    newTime &&
    (reasonType === "cant_make_it" || comment.trim().length > 0);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto dialog-mobile-fullscreen">
        <DialogHeader>
          <DialogTitle>
            {language === "ru" ? "Запрос на перенос" : "Ауыстыру сұранысы"}
          </DialogTitle>
          <DialogDescription>
            {booking && (
              language === "ru"
                ? `${booking.productTitle} — ${booking.date} ${booking.startTime?.slice(0, 5)}-${booking.endTime?.slice(0, 5)}`
                : `${booking.productTitle} — ${booking.date} ${booking.startTime?.slice(0, 5)}-${booking.endTime?.slice(0, 5)}`
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{language === "ru" ? "Желаемая дата" : "Қалаған күн"}</Label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{language === "ru" ? "Желаемое время" : "Қалаған уақыт"}</Label>
            <Input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Label>{language === "ru" ? "Причина" : "Себебі"}</Label>
            <RadioGroup
              value={reasonType}
              onValueChange={(v) => setReasonType(v as "cant_make_it" | "own")}
            >
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="cant_make_it" id="student_cant_make_it" />
                <label htmlFor="student_cant_make_it" className="text-sm cursor-pointer">
                  {language === "ru" ? "Не успеваю" : "Үлгермеймін"}
                </label>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="own" id="student_own_reason" />
                <label htmlFor="student_own_reason" className="text-sm cursor-pointer">
                  {language === "ru" ? "Своя причина" : "Өз себебім"}
                </label>
              </div>
            </RadioGroup>

            {reasonType === "own" && (
              <Textarea
                placeholder={language === "ru" ? "Укажите причину" : "Себебін жазыңыз"}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="resize-none"
              />
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            {language === "ru" ? "Отмена" : "Бас тарту"}
          </Button>
          <Button onClick={handleConfirm} disabled={isPending || !isValid}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {language === "ru" ? "Отправить запрос" : "Сұраныс жіберу"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudentRescheduleDialog;
