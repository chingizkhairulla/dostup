import { useState, useMemo, useEffect, useRef } from "react";
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
    location?: string;
  }) => void;
  isPending?: boolean;
}

function EditableTime({ time, onChange }: { time: string; onChange: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(time);
  useEffect(() => { setValue(time); }, [time]);
  const commit = () => {
    setEditing(false);
    if (value !== time && /^\d{2}:\d{2}$/.test(value)) onChange(value);
    else setValue(time);
  };
  if (editing) {
    return (
      <input
        type="time"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setValue(time); } }}
        className="w-[72px] text-[10px] font-mono bg-transparent border-0 border-b border-primary outline-none px-0 py-0 h-auto leading-none"
      />
    );
  }
  return (
    <span className="cursor-pointer hover:underline hover:text-primary transition-colors" onClick={() => setEditing(true)}>
      {time}
    </span>
  );
}

export default function SlotCreationWizard({ open, onOpenChange, language, onCreateSlots, isPending }: SlotCreationWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showLateHours, setShowLateHours] = useState(false);
  const [workingHours, setWorkingHours] = useState({ start: "09:00", end: "22:00" });
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatPeriod, setRepeatPeriod] = useState<"2weeks" | "1month" | "2months" | "custom" | null>("1month");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [slotDuration, setSlotDuration] = useState(60);
  const [customSlotDuration, setCustomSlotDuration] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(1);
  const [customMaxParticipants, setCustomMaxParticipants] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [location, setLocation] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  useEffect(() => {
    if (open) {
      setStep(1); setSelectedCells(new Set()); setIsMouseDown(false); setShowLateHours(false);
      setWorkingHours({ start: "09:00", end: "22:00" }); setRepeatWeekly(false); setRepeatPeriod("1month");
      setRepeatUntil(""); setSlotDuration(60); setCustomSlotDuration(""); setMaxParticipants(1);
      setCustomMaxParticipants(""); setTitle(""); setDescription(""); setImageUrl(""); setLocation(""); setDetailsOpen(false);
    }
  }, [open]);

  useEffect(() => {
    const up = () => setIsMouseDown(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const dict = {
    ru: {
      wizTitle: "Добавление слотов", showLateHours: "Показать поздние часы", hideLateHours: "Скрыть поздние часы",
      timeRange: "Диапазон часов", timezone: "Часовой пояс", start: "С", end: "По",
      weekDays: ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"],
      weekDaysFull: ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"],
      twoWeeks: "2 недели", oneMonth: "1 месяц", twoMonths: "2 месяца", custom: "Свой срок",
      lessonDuration: "Длительность одного урока", min: "мин",
      participants: "Количество участников в слоте", individual: "Индивидуально", group: "Группа",
      details: "Детали урока (необязательно)", titleLabel: "Название", description: "Описание",
      imageUrl: "Ссылка на обложку", location: "Местоположение",
      ready: "Готово", time: "Время", settings: "Настройки", clearAll: "Очистить",
      noSlotsWarning: "Выберите хотя бы одну клетку", repeatSummary: "Слоты будут созданы на следующие дни:",
    },
    kk: {
      wizTitle: "Слоттар қосу", showLateHours: "Кешкі сағаттарды көрсету", hideLateHours: "Кешкі сағаттарды жасыру",
      timeRange: "Сағат аралығы", timezone: "Уақыт белдеуі", start: "Басталуы", end: "Аяқталуы",
      weekDays: ["Дс","Сс","Ср","Бс","Жм","Сн","Жс"],
      weekDaysFull: ["Дүйсенбі","Сейсенбі","Сәрсенбі","Бейсенбі","Жұма","Сенбі","Жексенбі"],
      twoWeeks: "2 апта", oneMonth: "1 ай", twoMonths: "2 ай", custom: "Өз мерзімі",
      lessonDuration: "Бір сабақтың ұзақтығы", min: "мин",
      participants: "Слоттағы қатысушылар саны", individual: "Жеке", group: "Топ",
      details: "Сабақ туралы мәлімет (міндетті емес)", titleLabel: "Атауы", description: "Сипаттамасы",
      imageUrl: "Мұқаба сілтемесі", location: "Орналасу жері",
      ready: "Дайын", time: "Уақыт", settings: "Баптаулар", clearAll: "Тазарту",
      noSlotsWarning: "Кем дегенде бір ұяшықты таңдаңыз", repeatSummary: "Слоттар келесі күндерге жасалады:",
    },
  };
  const t = dict[language];

  const weekDates = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  const baseHours = useMemo(() => {
    const s = parseInt(workingHours.start.split(":")[0], 10) || 9;
    const e = parseInt(workingHours.end.split(":")[0], 10) || 22;
    const hours: number[] = [];
    for (let h = Math.max(0, Math.min(23, s)); h <= Math.max(0, Math.min(23, e)); h++) hours.push(h);
    return hours;
  }, [workingHours]);

  const lateHoursArr = useMemo(() => [23, 0, 1].filter((h) => !baseHours.includes(h)), [baseHours]);
  const displayHours = useMemo(() => showLateHours ? [...baseHours, ...lateHoursArr] : baseHours, [showLateHours, baseHours, lateHoursArr]);
  const closingHourStr = useMemo(() => {
    if (displayHours.length === 0) return "23:00";
    return `${String((displayHours[displayHours.length - 1] + 1) % 24).padStart(2, "0")}:00`;
  }, [displayHours]);

  const toggleCell = (cellId: string) => {
    setSelectedCells((prev) => { const next = new Set(prev); if (next.has(cellId)) next.delete(cellId); else next.add(cellId); return next; });
  };
  const handleCellMouseDown = (cellId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return; e.preventDefault(); setIsMouseDown(true);
    const willSelect = !selectedCells.has(cellId); setDragMode(willSelect ? "select" : "deselect");
    setSelectedCells((prev) => { const next = new Set(prev); if (willSelect) next.add(cellId); else next.delete(cellId); return next; });
  };
  const handleCellMouseEnter = (cellId: string) => {
    if (!isMouseDown) return;
    setSelectedCells((prev) => { const next = new Set(prev); if (dragMode === "select") next.add(cellId); else next.delete(cellId); return next; });
  };

  const selectedIntervalsByDay = useMemo(() => {
    const byDay: Record<number, { start: string; end: string }[]> = {};
    const add15 = (time: string) => { let [h, m] = time.split(":").map(Number); m += 15; if (m >= 60) { h = (h + 1) % 24; m -= 60; } return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`; };
    for (let day = 0; day < 7; day++) {
      const dayTimes = Array.from(selectedCells).filter((id) => id.startsWith(`${day}_`)).map((id) => id.split("_")[1]).sort((a, b) => { const [ah,am]=a.split(":").map(Number); const [bh,bm]=b.split(":").map(Number); return ah !== bh ? ah - bh : am - bm; });
      if (dayTimes.length === 0) continue;
      const intervals: { start: string; end: string }[] = [];
      let curStart = dayTimes[0], curEnd = dayTimes[0];
      for (let i = 1; i < dayTimes.length; i++) {
        if (dayTimes[i] === add15(curEnd)) curEnd = dayTimes[i];
        else { intervals.push({ start: curStart, end: add15(curEnd) }); curStart = curEnd = dayTimes[i]; }
      }
      intervals.push({ start: curStart, end: add15(curEnd) });
      byDay[day] = intervals;
    }
    return byDay;
  }, [selectedCells]);

  const activeDays = useMemo(() => Object.keys(selectedIntervalsByDay).map(Number), [selectedIntervalsByDay]);

  const getCellsBetween = (dayIdx: number, start: string, end: string): string[] => {
    const cells: string[] = [];
    let [h, m] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    const endMin = endH * 60 + endM;
    while (h * 60 + m < endMin) {
      cells.push(`${dayIdx}_${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
      m += 15; if (m >= 60) { h = (h + 1) % 24; m -= 60; }
    }
    return cells;
  };

  const updateIntervalTime = (dayIdx: number, oldInterval: { start: string; end: string }, newStart: string, newEnd: string) => {
    const [sh,sm] = newStart.split(":").map(Number); const [eh,em] = newEnd.split(":").map(Number);
    if (sh * 60 + sm >= eh * 60 + em) return;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      getCellsBetween(dayIdx, oldInterval.start, oldInterval.end).forEach((c) => next.delete(c));
      getCellsBetween(dayIdx, newStart, newEnd).forEach((c) => next.add(c));
      return next;
    });
  };

  const handleReady = () => {
    if (selectedCells.size === 0) return;
    const allIntervals = Object.values(selectedIntervalsByDay).flat();
    onCreateSlots({ daySlots: selectedIntervalsByDay, timeIntervals: allIntervals, repeatDays: activeDays, repeatWeekly, repeatPeriod: repeatWeekly ? repeatPeriod : null, repeatUntil: repeatWeekly && repeatPeriod === "custom" ? repeatUntil : null, slotDuration, maxParticipants, title: title.trim() || undefined, description: description.trim() || undefined, imageUrl: imageUrl.trim() || undefined, location: location.trim() || undefined });
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleToggleLateHours = () => {
    if (showLateHours) {
      setShowLateHours(false);
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
    } else {
      setShowLateHours(true);
    }
  };

  const renderHourRow = (h: number) => {
    const hourStr = String(h).padStart(2, "0");
    return (
      <div key={h} className="grid grid-cols-[70px_repeat(7,1fr)] relative">
        <div className="relative border-r border-border/60 select-none">
          <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">{hourStr}:00</span>
        </div>
        {Array.from({ length: 7 }).map((_, dayIdx) => (
          <div key={dayIdx} className="border-r last:border-r-0 border-border/60 flex flex-col">
            {[0, 15, 30, 45].map((m) => {
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
                    m === 0 ? "border-t border-border/80" : "border-t border-border/40",
                    isSelected
                      ? "bg-primary/35 border-t border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]"
                      : "hover:bg-primary/15 active:bg-primary/25"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const lateMaxHeight = lateHoursArr.length * 4 * 24 + 16;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="max-w-full h-full max-h-full m-0 p-0 rounded-none sm:rounded-none flex flex-col bg-background overflow-hidden border-0 gap-0 z-50">
        <VisuallyHidden><DialogTitle>Slot Creation Wizard</DialogTitle></VisuallyHidden>

        <header className="flex-none flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-card">
          <div className="pl-1 sm:pl-2">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">{t.wizTitle}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-auto pb-28">
          {step === 1 && (
            <div className="flex gap-4 p-2 sm:p-4 min-w-[650px]">
              <div className="flex-1 min-w-0">
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none">
                  <div className="grid grid-cols-[70px_repeat(7,1fr)] bg-muted/50 border-b border-border sticky top-0 z-10">
                    <div className="py-2.5 px-1 text-center text-[10px] sm:text-[11px] font-semibold text-muted-foreground border-r border-border/60 flex items-center justify-center">{t.timezone}</div>
                    {t.weekDays.map((dayName, idx) => {
                      const date = weekDates[idx]; const isCur = isSameDay(date, new Date());
                      const count = Array.from(selectedCells).filter((id) => id.startsWith(`${idx}_`)).length;
                      return (
                        <div key={idx} className={cn("py-2 px-1 text-center border-r last:border-r-0 border-border/60 flex flex-col items-center justify-center transition-colors", count > 0 && "bg-primary/5")}>
                          <span className="text-[11px] font-semibold text-muted-foreground">{dayName}</span>
                          <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5", isCur ? "bg-primary text-primary-foreground" : count > 0 ? "bg-primary/20 text-primary" : "text-foreground")}>
                            {format(date, "d")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-[70px_repeat(7,1fr)] bg-muted/10">
                    <div className="border-r border-border/60 h-2 sm:h-2.5" />
                    {Array.from({ length: 7 }).map((_, i) => <div key={i} className="border-r last:border-r-0 border-border/60 h-2 sm:h-2.5" />)}
                  </div>
                  <div className="bg-card">
                    {baseHours.map(renderHourRow)}
                    <div className="overflow-hidden transition-[max-height] duration-700 ease-in-out" style={{ maxHeight: showLateHours ? `${lateMaxHeight}px` : "0px" }}>
                      {lateHoursArr.map(renderHourRow)}
                    </div>
                    <div className="grid grid-cols-[70px_repeat(7,1fr)] relative">
                      <div className="relative border-r border-border/60 h-3 select-none">
                        <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">{closingHourStr}</span>
                      </div>
                      {Array.from({ length: 7 }).map((_, i) => <div key={i} className="border-r last:border-r-0 border-border/60 border-t border-border/70 h-3" />)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 mb-2 px-1">
                  <div className="w-[120px] flex justify-start">
                    {selectedCells.size > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedCells(new Set())} className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 rounded-full px-3">
                        <Trash2 className="w-3.5 h-3.5" />{t.clearAll}
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleLateHours}
                    className="text-xs text-muted-foreground hover:text-white hover:bg-primary hover:border-primary gap-1.5 rounded-full px-4 py-1.5 border-dashed transition-all"
                  >
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", showLateHours && "rotate-180")} />
                    <span>{showLateHours ? t.hideLateHours : t.showLateHours}</span>
                  </Button>

                  <div className="w-[120px] flex justify-end">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 rounded-full px-3 border-dashed text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" /><span>{t.timeRange}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="end">
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold">{t.timeRange}</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1"><Label className="text-xs">{t.start}</Label><Input type="time" value={workingHours.start} onChange={(e) => setWorkingHours({ ...workingHours, start: e.target.value })} className="h-8 text-xs" /></div>
                            <div className="space-y-1"><Label className="text-xs">{t.end}</Label><Input type="time" value={workingHours.end} onChange={(e) => setWorkingHours({ ...workingHours, end: e.target.value })} className="h-8 text-xs" /></div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div className="w-56 sm:w-64 flex-none">
                <div className="sticky top-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t.repeatSummary}</p>
                  <div className="space-y-2">
                    {activeDays.length === 0 ? (
                      <div className="p-3 border rounded-xl text-center text-xs text-muted-foreground border-dashed">{t.noSlotsWarning}</div>
                    ) : (
                      activeDays.map((dayIdx) => (
                        <div key={dayIdx} className="p-2.5 rounded-xl border border-border bg-card shadow-sm space-y-1.5">
                          <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">{t.weekDaysFull[dayIdx]}</Badge>
                          <div className="flex flex-wrap gap-1">
                            {selectedIntervalsByDay[dayIdx]?.map((interval, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] font-mono gap-0 px-1.5 cursor-default">
                                <EditableTime time={interval.start} onChange={(newTime) => updateIntervalTime(dayIdx, interval, newTime, interval.end)} />
                                <span className="mx-0.5">–</span>
                                <EditableTime time={interval.end} onChange={(newTime) => updateIntervalTime(dayIdx, interval, interval.start, newTime)} />
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-6 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                  <div>
                    <Label htmlFor="repeat-switch" className="text-sm font-semibold cursor-pointer">{language === "ru" ? "Повторять каждую неделю" : "Әр апта сайын қайталау"}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{language === "ru" ? "Автоматически повторять выбранные часы каждую неделю" : "Таңдалған сағаттарды әр апта сайын қайталау"}</p>
                  </div>
                  <Switch id="repeat-switch" checked={repeatWeekly} onCheckedChange={setRepeatWeekly} />
                </div>
                {repeatWeekly && (
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 animate-in fade-in zoom-in-95">
                    <Label className="text-xs font-semibold">{language === "ru" ? "Срок повторения:" : "Қайталау мерзімі:"}</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(["2weeks", "1month", "2months", "custom"] as const).map((period) => (
                        <Button key={period} type="button" variant={repeatPeriod === period ? "default" : "outline"} size="sm" onClick={() => setRepeatPeriod(period)} className={cn("text-xs", repeatPeriod === period && "bg-primary text-primary-foreground font-semibold")}>
                          {period === "2weeks" ? t.twoWeeks : period === "1month" ? t.oneMonth : period === "2months" ? t.twoMonths : t.custom}
                        </Button>
                      ))}
                    </div>
                    {repeatPeriod === "custom" && (
                      <div className="pt-2 max-w-xs">
                        <Label className="text-xs">{language === "ru" ? "Повторять до даты:" : "Күнге дейін қайталау:"}</Label>
                        <Input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className="h-9 mt-1 text-sm bg-background" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">{t.lessonDuration}</Label>
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 45, 50, 60, 90].map((dur) => (
                    <Button key={dur} type="button" variant={slotDuration === dur ? "default" : "outline"} size="sm" onClick={() => { setSlotDuration(dur); setCustomSlotDuration(""); }} className={cn(slotDuration === dur && "bg-primary text-primary-foreground font-semibold")}>
                      {dur} {t.min}
                    </Button>
                  ))}
                  <Input type="number" placeholder={t.custom} value={customSlotDuration} className="h-8 text-xs max-w-[80px]" onChange={(e) => { setCustomSlotDuration(e.target.value); if (e.target.value) setSlotDuration(Number(e.target.value)); }} />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">{t.participants}</Label>
                <div className="flex flex-wrap gap-2">
                  {[{ v: 1, label: `1 (${t.individual})` }, { v: 5, label: `5 (${t.group})` }, { v: 10, label: `10 (${t.group})` }].map(({ v, label }) => (
                    <Button key={v} type="button" variant={maxParticipants === v ? "default" : "outline"} size="sm" onClick={() => { setMaxParticipants(v); setCustomMaxParticipants(""); }} className={cn(maxParticipants === v && "bg-primary text-primary-foreground font-semibold")}>{label}</Button>
                  ))}
                  <Input type="number" placeholder={t.custom} value={customMaxParticipants} className="h-8 text-xs max-w-[80px]" onChange={(e) => { setCustomMaxParticipants(e.target.value); if (e.target.value) setMaxParticipants(Number(e.target.value)); }} />
                </div>
              </div>

              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="border rounded-xl p-4 bg-card shadow-sm">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                    <span className="text-sm font-semibold">{t.details}</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", detailsOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="space-y-1"><Label htmlFor="wiz-title" className="text-xs">{t.titleLabel}</Label><Input id="wiz-title" value={title} placeholder={language === "ru" ? "Например: Английский для начинающих" : "Сабақ атауы"} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" /></div>
                  <div className="space-y-1"><Label htmlFor="wiz-desc" className="text-xs">{t.description}</Label><Input id="wiz-desc" value={description} placeholder={language === "ru" ? "Краткое описание урока..." : "Сабақ сипаттамасы..."} onChange={(e) => setDescription(e.target.value)} className="h-9 text-sm" /></div>
                  <div className="space-y-1"><Label htmlFor="wiz-location" className="text-xs">{t.location}</Label><Input id="wiz-location" value={location} placeholder={language === "ru" ? "Например: Zoom, г. Алматы, ул. Абая 1" : "Мысалы: Zoom, Алматы қ."} onChange={(e) => setLocation(e.target.value)} className="h-9 text-sm" /></div>
                  <div className="space-y-1"><Label htmlFor="wiz-img" className="text-xs">{t.imageUrl}</Label><Input id="wiz-img" type="url" value={imageUrl} placeholder="https://..." onChange={(e) => setImageUrl(e.target.value)} className="h-9 text-sm" /></div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 py-3 bg-card/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-20">
          <div className="w-full flex items-center justify-between">
            <div className="w-20 sm:w-24 flex items-center justify-start" />
            <div className="flex items-center justify-center gap-1.5">
              <div className="w-8 h-8 flex items-center justify-end">
                {step > 1 && (
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setStep(step - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-center w-40 sm:w-52">
                <div className="flex flex-col items-center gap-0.5 flex-none">
                  <button type="button" onClick={() => setStep(1)} className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all", step >= 1 ? "bg-primary text-primary-foreground ring-4 ring-background shadow-sm" : "bg-muted text-muted-foreground")}>1</button>
                  <span className={cn("text-[10px] tracking-wider uppercase transition-colors select-none", step === 1 ? "text-primary font-bold" : "text-muted-foreground font-medium")}>{t.time}</span>
                </div>
                <div className="flex-1 h-[2px] mx-2 -mt-3.5 bg-muted overflow-hidden">
                  <div className={cn("h-full bg-primary transition-all duration-300", step >= 2 ? "w-full" : "w-0")} />
                </div>
                <div className="flex flex-col items-center gap-0.5 flex-none">
                  <button type="button" onClick={() => { if (selectedCells.size > 0) setStep(2); }} className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all", step >= 2 ? "bg-primary text-primary-foreground ring-4 ring-background shadow-sm" : "bg-muted text-muted-foreground")}>2</button>
                  <span className={cn("text-[10px] tracking-wider uppercase transition-colors select-none", step === 2 ? "text-primary font-bold" : "text-muted-foreground font-medium")}>{t.settings}</span>
                </div>
              </div>
              <div className="w-8 h-8 flex items-center justify-start">
                {step < 2 ? (
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setStep(step + 1)} disabled={step === 1 && selectedCells.size === 0}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="w-20 sm:w-24 flex items-center justify-end">
              <Button size="sm" className="h-9 px-4 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" onClick={handleReady} disabled={isPending || selectedCells.size === 0}>
                {isPending ? "..." : t.ready}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
