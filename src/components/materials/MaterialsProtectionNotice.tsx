import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

const STORAGE_KEY = "materials_warning_shown";

const MaterialsProtectionNotice = () => {
  const { l } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
        sessionStorage.setItem(STORAGE_KEY, "1");
      }
    } catch {
      setOpen(true);
    }
  }, []);


  return (
    <>
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
        <ShieldAlert className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm text-destructive font-medium leading-snug">
          {l({
            ru: "Контент защищён. Запрещены скриншоты, запись экрана и пересылка материалов третьим лицам",
            kk: "Мазмұн қорғалған. Скриншот жасау, экранды жазу және материалдарды үшінші тарапқа жіберуге тыйым салынады",
            en: "This content is protected. Screenshots, screen recording and passing materials to third parties are not allowed",
          })}
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <DialogTitle className="text-center">
              {l({ ru: "Контент защищён", kk: "Контент қорғалған", en: "This content is protected" })}
            </DialogTitle>
            <DialogDescription className="text-center leading-relaxed">
              {l({
                ru: "Скриншоты, запись экрана и пересылка материалов третьим лицам запрещены. Все материалы содержат водяной знак с вашими данными. Нарушение повлечёт блокировку доступа.",
                kk: "Материалдарды скриншот жасау, экранды жазу және үшінші тарапқа жіберуге тыйым салынады. Барлық материалдарда сіздің деректеріңізбен су таңбасы бар. Бұзу қол жеткізуді бұғаттауға әкеледі.",
                en: "Screenshots, screen recording and passing materials to third parties are not allowed. Every material carries a watermark with your details. Breaking this rule will block your access.",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={() => setOpen(false)}>
              {l({ ru: "Понятно", kk: "Түсінікті", en: "Understood" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MaterialsProtectionNotice;