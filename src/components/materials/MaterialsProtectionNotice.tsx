import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

// Products whose protection warning the buyer has already confirmed.
const STORAGE_KEY = "materials_warning_products";

const readSeen = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

interface MaterialsProtectionNoticeProps {
  /** Products the buyer currently has access to. */
  productIds: string[];
}

/** Warns a buyer about content protection once for every product they get access to. */
const MaterialsProtectionNotice = ({ productIds }: MaterialsProtectionNoticeProps) => {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (productIds.length === 0) return;
    const seen = new Set(readSeen());
    if (productIds.some((id) => !seen.has(id))) setOpen(true);
  }, [productIds]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...readSeen(), ...productIds])]));
    } catch {
      // Storage unavailable: the warning shows again next time, which is acceptable.
    }
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
