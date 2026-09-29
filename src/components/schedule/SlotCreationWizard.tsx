import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Clock, ChevronDown, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";

interface SlotCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: "ru" | "kk";
  onCreateSlots: (params: {
    daySlots?: Record<number, { start: string; end: string }[]>;
    timeIntervals: { start: string; end: string }[];
    repeatDays: number[];
    repeatWeekly: boolean;
    repeatPeriod: "2weeks" | "1month" | "2months" | "custom" | null;
    repeatUntil: string | null;
    slotDuration: number;
    maxParticipants: number;
    title?: string;
    description?: string;
    imageUrl?: string;
  }) => void;
  isPending?: boolean;
}

export default function SlotCreationWizard({
  open,
  onOpenChange,
  language,
  onCreateSlots,
  isPending,
}: SlotCreationWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1 State: cells format is `${dayIndex}_${hour}:${minute}`, e.g. "0_09:00", "0_09:15"
  // dayIndex: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showLateHours, setShowLateHours] = useState(false);
  const [workingHours, setWorkingHours] = useState({ start: "09:00", end: "22:00" });

  // Step 2 State
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatPeriod, setRepeatPeriod] = useState<"2weeks" | "1month" | "2months" | "custom" | null>("1month");
  const [repeatUntil, setRepeatUntil] = useState<string>("");

  // Step 3 State
  const [slotDuration, setSlotDuration] = useState<number>(60);
  const [customSlotDuration, setCustomSlotDuration] = useState<string>("");
  const [maxParticipants, setMaxParticipants] = useState<number>(1);
  const [customMaxParticipants, setCustomMaxParticipants] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedCells(new Set());
      setIsMouseDown(false);
      setShowLateHours(false);
      setWorkingHours({ start: "09:00", end: "22:00" });
      setRepeatWeekly(false);
      setRepeatPeriod("1month");
      setRepeatUntil("");
      setSlotDuration(60);
      setCustomSlotDuration("");
      setMaxParticipants(1);
      setCustomMaxParticipants("");
      setTitle("");
      setDescription("");
      setImageUrl("");
      setDetailsOpen(false);
    }
  }, [open]);

  const dict = {
    ru: {
      step1: "Выбор времени",
      step2: "Повторение",
      step3: "Настройки",
      showLateHours: "Показать поздние часы",
      hideLateHours: "Скрыть поздние часы",
      timeRange: "Диапазон часов",
      timezone: "Часовой пояс",
      start: "С",
      end: "По",
      weekDays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
      weekDaysFull: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
      everyWeek: "Повторять каждую неделю",
      twoWeeks: "2 недели",
      oneMonth: "1 месяц",
      twoMonths: "2 месяца",
      custom: "Свой срок",
      lessonDuration: "Длительность одного урока",
      min: "мин",
      participants: "Количество участников в слоте",
      individual: "Индивидуально",
      group: "Группа",
      details: "Детали урока (необязательно)",
      title: "Название",
      description: "Описание",
      imageUrl: "Ссылка на обложку",
      ready: "Готово",
      time: "Время",
      repeat: "Повтор",
      settings: "Настройки",
      clearAll: "Очистить всё",
      noSlotsWarning: "Выберите хотя бы одну клетку на сетке времени",
      repeatSummary: "Слоты будут созданы на следующие дни:",
    },
    kk: {
      step1: "Уақытты таңдау",
      step2: "Қайталау",
      step3: "Баптаулар",
      showLateHours: "Кешкі сағаттарды көрсету",
      hideLateHours: "Кешкі сағаттарды жасыру",
      timeRange: "Сағат аралығы",
      timezone: "Уақыт белдеуі",
      start: "Басталуы",
      end: "Аяқталуы",
      weekDays: ["Дс", "Сс", "Ср", "Бс", "Жм", "Сн", "Жс"],
      weekDaysFull: ["Дүйсенбі", "Сейсенбі", "Сәрсенбі", "Бейсенбі", "Жұма", "Сенбі", "Жексенбі"],
      everyWeek: "Әр апта сайын қайталау",
      twoWeeks: "2 апта",
      oneMonth: "1 ай",
      twoMonths: "2 ай",
      custom: "Өз мерзімі",
      lessonDuration: "Бір сабақтың ұзақтығы",
      min: "мин",
      participants: "Слоттағы қатысушылар саны",
      individual: "Жеке",
      group: "Топ",
      details: "Сабақ туралы мәлімет (міндетті емес)",
      title: "Атауы",
      description: "Сипаттамасы",
      imageUrl: "Мұқаба сілтемесі",
      ready: "Дайын",
      time: "Уақыт",
      repeat: "Қайталау",
      settings: "Баптаулар",
      clearAll: "Тазарту",
      noSlotsWarning: "Кем дегенде бір ұяшықты таңдаңыз",
      repeatSummary: "Слоттар келесі күндерге жасалады:",
    }
  };

  const t = dict[language];

  // Dates for current week (Mon -> Sun)
  const weekDates = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  // Hours generator (default: 09:00 - 22:00, with late hours: extends up to 01:00 AM)
  const displayHours = useMemo(() => {
    const startHour = parseInt(workingHours.start.split(":")[0], 10) || 9;
    const endHour = parseInt(workingHours.end.split(":")[0], 10) || 22;

    const safeStart = Math.max(0, Math.min(23, startHour));
    const safeEnd = Math.max(0, Math.min(23, endHour));

    const hours: number[] = [];
    for (let h = safeStart; h <= safeEnd; h++) {
      hours.push(h);
    }
    if (showLateHours) {
      // Add late hours (23, 00, 01) if not already in range
      const late = [23, 0, 1];
      for (const lh of late) {
        if (!hours.includes(lh)) {
          hours.push(lh);
        }
      }
    }
    return hours;
  }, [showLateHours, workingHours]);

  const closingHourStr = useMemo(() => {
    if (displayHours.length === 0) return "23:00";
    const lastH = displayHours[displayHours.length - 1];
    const nextH = (lastH + 1) % 24;
    return `${String(nextH).padStart(2, "0")}:00`;
  }, [displayHours]);

  // Drag selection state
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsMouseDown(false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const toggleCell = (cellId: string) => {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellId)) {
        next.delete(cellId);
      } else {
        next.add(cellId);
      }
      return next;
    });
  };

  const handleCellMouseDown = (cellId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary button
    e.preventDefault();
    setIsMouseDown(true);
    const willSelect = !selectedCells.has(cellId);
    setDragMode(willSelect ? "select" : "deselect");
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (willSelect) next.add(cellId);
      else next.delete(cellId);
      return next;
    });
  };

  const handleCellMouseEnter = (cellId: string) => {
    if (!isMouseDown) return;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (dragMode === "select") next.add(cellId);
      else next.delete(cellId);
      return next;
    });
  };

  // Group selected 15-min cells into contiguous intervals per day
  const selectedIntervalsByDay = useMemo(() => {
    const byDay: Record<number, { start: string; end: string }[]> = {};

    const add15Min = (time: string) => {
      let [h, m] = time.split(":").map(Number);
      m += 15;
      if (m >= 60) {
        h = (h + 1) % 24;
        m -= 60;
      }
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };

    for (let day = 0; day < 7; day++) {
      const dayTimes = Array.from(selectedCells)
        .filter((id) => id.startsWith(`${day}_`))
        .map((id) => id.split("_")[1])
        .sort((a, b) => {
          const [ah, am] = a.split(":").map(Number);
          const [bh, bm] = b.split(":").map(Number);
          return ah !== bh ? ah - bh : am - bm;
        });

      if (dayTimes.length === 0) continue;

      const intervals: { start: string; end: string }[] = [];
      let curStart = dayTimes[0];
      let curEnd = dayTimes[0];

      for (let i = 1; i < dayTimes.length; i++) {
        if (dayTimes[i] === add15Min(curEnd)) {
          curEnd = dayTimes[i];
        } else {
          intervals.push({ start: curStart, end: add15Min(curEnd) });
          curStart = dayTimes[i];
          curEnd = dayTimes[i];
        }
      }
      intervals.push({ start: curStart, end: add15Min(curEnd) });
      byDay[day] = intervals;
    }

    return byDay;
  }, [selectedCells]);

  const activeDays = useMemo(() => {
    return Object.keys(selectedIntervalsByDay).map(Number);
  }, [selectedIntervalsByDay]);

  const handleReady = () => {
    if (selectedCells.size === 0) return;

    const allIntervals = Object.values(selectedIntervalsByDay).flat();

    onCreateSlots({
      daySlots: selectedIntervalsByDay,
      timeIntervals: allIntervals,
      repeatDays: activeDays,
      repeatWeekly,
      repeatPeriod: repeatWeekly ? repeatPeriod : null,
      repeatUntil: repeatWeekly && repeatPeriod === "custom" ? repeatUntil : null,
      slotDuration,
      maxParticipants,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 100dvh, not 100%: on phones the browser toolbar would otherwise hide the bottom bar with "Готово". */}
      <DialogContent hideCloseButton className="max-w-full h-[100dvh] max-h-[100dvh] m-0 p-0 rounded-none sm:rounded-none flex flex-col bg-background overflow-hidden border-0 gap-0 z-50">
        <VisuallyHidden>
          <DialogTitle>Slot Creation Wizard</DialogTitle>
        </VisuallyHidden>

        {/* Top Header */}
        <header className="flex-none flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b bg-card">
          {/* Step Title (left) - with padding, no left cross */}
          <div className="min-w-0 pl-1 sm:pl-2">
            <h2 className="truncate text-base sm:text-lg font-semibold text-foreground">
              {step === 1 ? t.step1 : step === 2 ? t.step2 : t.step3}
            </h2>
          </div>

          {/* Right Controls: settings-style round close button. On phones the actions are icon-only. */}
          <div className="flex flex-none items-center gap-1.5 sm:gap-2">
            {step === 1 && (
              <>
                {selectedCells.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCells(new Set())}
                    aria-label={t.clearAll}
                    title={t.clearAll}
                    className="text-xs h-8 w-8 sm:w-auto p-0 sm:px-3 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.clearAll}</span>
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t.timeRange}
                      title={t.timeRange}
                      className="h-8 w-8 sm:w-auto p-0 sm:px-3 text-xs gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t.timeRange}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold">{t.timeRange}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t.start}</Label>
                          <Input
                            type="time"
                            value={workingHours.start}
                            onChange={(e) => setWorkingHours({ ...workingHours, start: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t.end}</Label>
                          <Input
                            type="time"
                            value={workingHours.end}
                            onChange={(e) => setWorkingHours({ ...workingHours, end: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            )}

            {/* Round close button like in Settings */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-auto pb-[calc(7rem+env(safe-area-inset-bottom))]">
          {/* STEP 1: Google Calendar Week Grid */}
          {step === 1 && (
            <div className="min-w-[650px] max-w-5xl mx-auto p-2 sm:p-4">
              {/* Weekly Calendar Table */}
              <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none">
                {/* Header Row: Days of the week (sticky) */}
                <div className="grid grid-cols-[70px_repeat(7,1fr)] bg-muted/50 border-b border-border sticky top-0 z-10">
                  <div className="py-2.5 px-1 text-center text-[10px] sm:text-[11px] font-semibold text-muted-foreground border-r border-border/60 flex items-center justify-center">
                    {t.timezone}
                  </div>
                  {t.weekDays.map((dayName, idx) => {
                    const date = weekDates[idx];
                    const isCur = isSameDay(date, new Date());
                    const countForDay = Array.from(selectedCells).filter((id) => id.startsWith(`${idx}_`)).length;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "py-2 px-1 text-center border-r last:border-r-0 border-border/60 flex flex-col items-center justify-center transition-colors",
                          countForDay > 0 && "bg-primary/5"
                        )}
                      >
                        <span className="text-[11px] font-semibold text-muted-foreground">{dayName}</span>
                        <div
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5",
                            isCur
                              ? "bg-primary text-primary-foreground"
                              : countForDay > 0
                              ? "bg-primary/20 text-primary"
                              : "text-foreground"
                          )}
                        >
                          {format(date, "d")}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 15-min top spacer row so 09:00 sits on its own line below the dates header */}
                <div className="grid grid-cols-[70px_repeat(7,1fr)] bg-muted/10">
                  <div className="border-r border-border/60 h-4 sm:h-5" />
                  {Array.from({ length: 7 }).map((_, idx) => (
                    <div key={idx} className="border-r last:border-r-0 border-border/60 h-4 sm:h-5" />
                  ))}
                </div>

                {/* 15-min Time Grid Rows */}
                <div className="bg-card">
                  {displayHours.map((h) => {
                    const hourStr = String(h).padStart(2, "0");
                    const quarters = [0, 15, 30, 45];

                    return (
                      <div key={h} className="grid grid-cols-[70px_repeat(7,1fr)] relative">
                        {/* Time Label on left: positioned on the dividing line */}
                        <div className="relative border-r border-border/60 select-none">
                          <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">
                            {hourStr}:00
                          </span>
                        </div>

                        {/* 7 Day Columns */}
                        {Array.from({ length: 7 }).map((_, dayIdx) => (
                          <div key={dayIdx} className="border-r last:border-r-0 border-border/60 flex flex-col">
                            {quarters.map((m) => {
                              const minuteStr = String(m).padStart(2, "0");
                              const cellId = `${dayIdx}_${hourStr}:${minuteStr}`;
                              const isSelected = selectedCells.has(cellId);

                              return (
                                <button
                                  key={m}
                                  type="button"
                                  onMouseDown={(e) => handleCellMouseDown(cellId, e)}
                                  onMouseEnter={() => handleCellMouseEnter(cellId)}
                                  onTouchStart={() => toggleCell(cellId)}
                                  className={cn(
                                    "h-5 sm:h-6 w-full transition-colors cursor-pointer select-none",
                                    m === 0 && "border-t border-border/70",
                                    m === 30 && "border-t border-border/25 border-dashed",
                                    (m === 15 || m === 45) && "border-t border-border/10",
                                    isSelected
                                      ? "bg-primary border-primary"
                                      : "hover:bg-primary/20 active:bg-primary/30"
                                  )}
                                  title={`${t.weekDaysFull[dayIdx]} ${hourStr}:${minuteStr}`}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {/* Closing line at the bottom */}
                  <div className="grid grid-cols-[70px_repeat(7,1fr)] relative">
                    <div className="relative border-r border-border/60 h-3 select-none">
                      <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">
                        {closingHourStr}
                      </span>
                    </div>
                    {Array.from({ length: 7 }).map((_, dayIdx) => (
                      <div key={dayIdx} className="border-r last:border-r-0 border-border/60 border-t border-border/70 h-3" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Late hours toggle button centered at the bottom of all slots */}
              <div className="flex justify-center mt-3 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLateHours(!showLateHours)}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-full px-4 py-1.5 border-dashed"
                >
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showLateHours && "rotate-180")} />
                  <span>
                    {showLateHours ? t.hideLateHours : t.showLateHours}
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Repetition */}
          {step === 2 && (
            <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-6 animate-in slide-in-from-right-4">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">{t.repeatSummary}</Label>
                <div className="space-y-2">
                  {activeDays.length === 0 ? (
                    <div className="p-4 border rounded-xl text-center text-sm text-muted-foreground">
                      {t.noSlotsWarning}
                    </div>
                  ) : (
                    activeDays.map((dayIdx) => (
                      <div
                        key={dayIdx}
                        className="flex items-center justify-between p-3 rounded-xl border border-border bg-card shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">
                            {t.weekDaysFull[dayIdx]}
                          </Badge>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedIntervalsByDay[dayIdx]?.map((interval, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-mono">
                                {interval.start} – {interval.end}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Weekly repetition toggle */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                  <div>
                    <Label htmlFor="repeat-switch" className="text-sm font-semibold cursor-pointer">
                      {t.everyWeek}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {language === "ru"
                        ? "Автоматически повторять выбранные часы каждую неделю"
                        : "Таңдалған сағаттарды әр апта сайын қайталау"}
                    </p>
                  </div>
                  <Switch id="repeat-switch" checked={repeatWeekly} onCheckedChange={setRepeatWeekly} />
                </div>

                {repeatWeekly && (
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 animate-in fade-in zoom-in-95">
                    <Label className="text-xs font-semibold">{language === "ru" ? "Срок повторения:" : "Қайталау мерзімі:"}</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(["2weeks", "1month", "2months", "custom"] as const).map((period) => (
                        <Button
                          key={period}
                          type="button"
                          variant={repeatPeriod === period ? "default" : "outline"}
                          size="sm"
                          onClick={() => setRepeatPeriod(period)}
                          className={cn("text-xs", repeatPeriod === period && "bg-primary text-primary-foreground font-semibold")}
                        >
                          {period === "2weeks"
                            ? t.twoWeeks
                            : period === "1month"
                            ? t.oneMonth
                            : period === "2months"
                            ? t.twoMonths
                            : t.custom}
                        </Button>
                      ))}
                    </div>

                    {repeatPeriod === "custom" && (
                      <div className="pt-2 max-w-xs">
                        <Label className="text-xs">{language === "ru" ? "Повторять до даты:" : "Күнге дейін қайталау:"}</Label>
                        <Input
                          type="date"
                          value={repeatUntil}
                          onChange={(e) => setRepeatUntil(e.target.value)}
                          className="h-9 mt-1 text-sm bg-background"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Settings */}
          {step === 3 && (
            <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-6 animate-in slide-in-from-right-4">
              {/* Duration */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">{t.lessonDuration}</Label>
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 45, 50, 60, 90].map((dur) => (
                    <Button
                      key={dur}
                      type="button"
                      variant={slotDuration === dur ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSlotDuration(dur);
                        setCustomSlotDuration("");
                      }}
                      className={cn(slotDuration === dur && "bg-primary text-primary-foreground font-semibold")}
                    >
                      {dur} {t.min}
                    </Button>
                  ))}
                  <div className="flex items-center gap-1 max-w-[110px]">
                    <Input
                      type="number"
                      placeholder={t.custom}
                      value={customSlotDuration}
                      className="h-8 text-xs"
                      onChange={(e) => {
                        setCustomSlotDuration(e.target.value);
                        if (e.target.value) setSlotDuration(Number(e.target.value));
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Participants */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">{t.participants}</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={maxParticipants === 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setMaxParticipants(1);
                      setCustomMaxParticipants("");
                    }}
                    className={cn(maxParticipants === 1 && "bg-primary text-primary-foreground font-semibold")}
                  >
                    1 ({t.individual})
                  </Button>
                  <Button
                    type="button"
                    variant={maxParticipants === 5 ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setMaxParticipants(5);
                      setCustomMaxParticipants("");
                    }}
                    className={cn(maxParticipants === 5 && "bg-primary text-primary-foreground font-semibold")}
                  >
                    5 ({t.group})
                  </Button>
                  <Button
                    type="button"
                    variant={maxParticipants === 10 ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setMaxParticipants(10);
                      setCustomMaxParticipants("");
                    }}
                    className={cn(maxParticipants === 10 && "bg-primary text-primary-foreground font-semibold")}
                  >
                    10 ({t.group})
                  </Button>
                  <div className="flex items-center gap-1 max-w-[110px]">
                    <Input
                      type="number"
                      placeholder={t.custom}
                      value={customMaxParticipants}
                      className="h-8 text-xs"
                      onChange={(e) => {
                        setCustomMaxParticipants(e.target.value);
                        if (e.target.value) setMaxParticipants(Number(e.target.value));
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Optional Details Collapsible */}
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="border rounded-xl p-4 bg-card shadow-sm">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                    <span className="text-sm font-semibold">{t.details}</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", detailsOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="space-y-1">
                    <Label htmlFor="wiz-title" className="text-xs">
                      {t.title}
                    </Label>
                    <Input
                      id="wiz-title"
                      value={title}
                      placeholder={language === "ru" ? "Например: Английский для начинающих" : "Сабақ атауы"}
                      onChange={(e) => setTitle(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="wiz-desc" className="text-xs">
                      {t.description}
                    </Label>
                    <Input
                      id="wiz-desc"
                      value={description}
                      placeholder={language === "ru" ? "Краткое описание урока..." : "Сабақ сипаттамасы..."}
                      onChange={(e) => setDescription(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="wiz-img" className="text-xs">
                      {t.imageUrl}
                    </Label>
                    <Input
                      id="wiz-img"
                      type="url"
                      value={imageUrl}
                      placeholder="https://..."
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>

        {/* Bottom Navigation Bar (clears the iPhone home indicator) */}
        <div className="fixed bottom-0 left-0 right-0 px-3 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-card/95 backdrop-blur-sm border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-20">
          <div className="w-full flex items-center justify-between gap-2">
            {/* Left: Back button */}
            <div className="w-8 sm:w-24 flex-none flex items-center justify-start">
              {step > 1 && (
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setStep(step - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Center: Stepper (strictly ends at step 3) + Next button */}
            <div className="flex-1 min-w-0 flex items-center justify-center">
              <div className="flex-1 min-w-0 max-w-[16rem] flex items-center justify-center">
                {/* Step 1 */}
                <div className="flex flex-col items-center gap-0.5 flex-none">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all",
                      step >= 1
                        ? "bg-primary text-primary-foreground ring-4 ring-background shadow-sm"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    1
                  </button>
                  <span
                    className={cn(
                      "text-[10px] tracking-normal sm:tracking-wider uppercase whitespace-nowrap transition-colors select-none",
                      step === 1 ? "text-primary font-bold" : "text-muted-foreground font-medium"
                    )}
                  >
                    {t.time}
                  </span>
                </div>

                {/* Segment 1 -> 2 (strictly stops at step 2) */}
                <div className="flex-1 min-w-2 h-[2px] mx-1 sm:mx-2 -mt-3.5 bg-muted overflow-hidden">
                  <div className={cn("h-full bg-primary transition-all duration-300", step >= 2 ? "w-full" : "w-0")} />
                </div>

                {/* Step 2 */}
                <div className="flex flex-col items-center gap-0.5 flex-none">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCells.size > 0) setStep(2);
                    }}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all",
                      step >= 2
                        ? "bg-primary text-primary-foreground ring-4 ring-background shadow-sm"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    2
                  </button>
                  <span
                    className={cn(
                      "text-[10px] tracking-normal sm:tracking-wider uppercase whitespace-nowrap transition-colors select-none",
                      step === 2 ? "text-primary font-bold" : "text-muted-foreground font-medium"
                    )}
                  >
                    {t.repeat}
                  </span>
                </div>

                {/* Segment 2 -> 3 (strictly stops at step 3) */}
                <div className="flex-1 min-w-2 h-[2px] mx-1 sm:mx-2 -mt-3.5 bg-muted overflow-hidden">
                  <div className={cn("h-full bg-primary transition-all duration-300", step >= 3 ? "w-full" : "w-0")} />
                </div>

                {/* Step 3 (END OF LINE) */}
                <div className="flex flex-col items-center gap-0.5 flex-none">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCells.size > 0) setStep(3);
                    }}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all",
                      step >= 3
                        ? "bg-primary text-primary-foreground ring-4 ring-background shadow-sm"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    3
                  </button>
                  <span
                    className={cn(
                      "text-[10px] tracking-normal sm:tracking-wider uppercase whitespace-nowrap transition-colors select-none",
                      step === 3 ? "text-primary font-bold" : "text-muted-foreground font-medium"
                    )}
                  >
                    {t.settings}
                  </span>
                </div>
              </div>

              {/* Next arrow right after Step 3 */}
              {step < 3 ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full ml-1.5 sm:ml-2 flex-none"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && selectedCells.size === 0}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <div className="w-8 h-8 ml-1.5 sm:ml-2 flex-none" />
              )}
            </div>

            {/* Right: "Готово" button pinned directly to far-right corner */}
            <div className="flex-none sm:w-24 flex items-center justify-end">
              <Button
                size="sm"
                className="h-9 px-3 sm:px-4 text-xs font-semibold whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                onClick={handleReady}
                disabled={isPending || selectedCells.size === 0}
              >
                {isPending ? "..." : t.ready}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
