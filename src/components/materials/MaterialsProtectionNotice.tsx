import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

const storageKey = (buyerId: string) => `materials_warning_seen_${buyerId}`;

interface MaterialsProtectionNoticeProps {
  buyerId: string;
}

/** Warns each buyer once, when they first open the Materials section. */
const MaterialsProtectionNotice = ({ buyerId }: MaterialsProtectionNoticeProps) => {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const key = storageKey(buyerId);
      const shouldShow = localStorage.getItem(key) !== "1";
      if (shouldShow) localStorage.setItem(key, "1");
      setOpen(shouldShow);
    } catch {
      setOpen(true);
    }
  }, [buyerId]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
  };

  const isKk = language === "kk";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl sm:rounded-2xl">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">
            {isKk ? "Контент қорғалған" : "Контент защищён"}
          </DialogTitle>
          <DialogDescription className="text-center leading-relaxed">
            {isKk
              ? "Материалдарды скриншот жасау, экранды жазу және үшінші тарапқа жіберуге тыйым салынады. Барлық материалдарда сіздің деректеріңізбен су таңбасы бар. Бұзу қол жеткізуді бұғаттауға әкеледі."
              : "Скриншоты, запись экрана и пересылка материалов третьим лицам запрещены. Все материалы содержат водяной знак с вашими данными. Нарушение повлечёт блокировку доступа."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={() => handleOpenChange(false)}>
            {isKk ? "Түсінікті" : "Понятно"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialsProtectionNotice;
