import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, ChevronDown, Trash2, Check, MapPin, Plus, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import CoverCropEditor from "@/components/creator/CoverCropEditor";
import { useCoverCrop } from "@/hooks/useCoverCrop";

const ReqStar = () => (
  <span className="text-primary font-bold ml-1 text-sm sm:text-base inline-block -translate-y-0.5 select-none leading-none" aria-hidden="true">
    *
  </span>
);

interface SlotSettings {
  slotDuration?: number;
  customDuration?: string;
  maxParticipants?: number;
  customParticipants?: string;
  title: string;
  description: string;
  imageUrl: string;
  location: string;
}

interface SlotCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: "ru" | "kk";
  existingSlots?: {
    date: string;
    start_time: string;
    end_time: string;
    slot_duration?: number;
    max_participants?: number;
    title?: string | null;
    description?: string | null;
    image_url?: string | null;
    location?: string | null;
  }[];
  onCreateSlots: (params: {
    daySlots?: Record<
      number,
      {
        start: string;
        end: string;
        slotDuration?: number;
        maxParticipants?: number;
        title?: string;
        description?: string;
        imageUrl?: string;
        location?: string;
      }[]
    >;
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

// Editable time input: protects colon, modifies only hours and minutes
function EditableTime({ time, onChange }: { time: string; onChange: (t: string) => void }) {
  return (
    <input
      type="time"
      value={time}
      onChange={(e) => {
        if (e.target.value) {
          onChange(e.target.value);
        }
      }}
      className="w-[66px] h-6 text-xs sm:text-sm font-mono bg-background/90 hover:bg-background border border-border/80 rounded px-1 py-0 outline-none text-foreground text-center cursor-pointer focus:cursor-text focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
      title="Нажмите, чтобы изменить часы и минуты"
    />
  );
}

export default function SlotCreationWizard({
  open,
  onOpenChange,
  language,
  existingSlots,
  onCreateSlots,
  isPending,
}: SlotCreationWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showLateHours, setShowLateHours] = useState(false);
  const [workingHours, setWorkingHours] = useState({ start: "09:00", end: "21:00" });
  const [tempWorkingHours, setTempWorkingHours] = useState({ start: "09:00", end: "21:00" });
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  // Cover cropper
  const coverCrop = useCoverCrop();
  const [cropSaving, setCropSaving] = useState(false);

  // Custom manual time edits in Step 1
  const [customDayIntervals, setCustomDayIntervals] = useState<Record<number, { start: string; end: string }[]>>({});

  // Step 2: Per-slot settings state
  // Key format: `${dayIdx}_${start}_${end}`
  const [slotSettingsMap, setSlotSettingsMap] = useState<Record<string, SlotSettings>>({});
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

  // Step 2: Global repetition settings (default: 2 weeks)
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [repeatDays, setRepeatDays] = useState<number[]>([0, 1, 2, 3, 4]); // Mon-Fri
  const [repeatPeriod, setRepeatPeriod] = useState<"2weeks" | "1month" | "2months" | "custom" | null>("2weeks");
  const [repeatUntil, setRepeatUntil] = useState("");

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number>(0);

  const weekDates = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  const handleSaveCrop = async () => {
    if (!coverCrop.source || cropSaving) return;
    setCropSaving(true);
    try {
      const result = await coverCrop.cropResult();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          updateSelectedSlotsField("imageUrl", reader.result);
        }
      };
      reader.readAsDataURL(result.file);
      coverCrop.resetCrop();
    } catch {
      // ignore
    } finally {
      setCropSaving(false);
    }
  };

  useEffect(() => {
    if (open) {
      setStep(1);
      const initialCells = new Set<string>();

      if (existingSlots && existingSlots.length > 0) {
        weekDates.forEach((date, dayIdx) => {
          const dateStr = format(date, "yyyy-MM-dd");
          const dayExisting = existingSlots.filter((s) => s.date === dateStr);
          dayExisting.forEach((s) => {
            const startStr = s.start_time.slice(0, 5);
            const endStr = s.end_time.slice(0, 5);
            const [sh, sm] = startStr.split(":").map(Number);
            const [eh, em] = endStr.split(":").map(Number);
            const startM = sh * 60 + sm;
            const endM = eh * 60 + em;
            for (let m = startM; m < endM; m += 30) {
              const ch = Math.floor(m / 60);
              const cm = m % 60;
              const cellId = `${dayIdx}_${String(ch).padStart(2, "0")}:${String(cm).padStart(2, "0")}`;
              initialCells.add(cellId);
            }
          });
        });
      }

      setSelectedCells(initialCells);
      setCustomDayIntervals({});
      setSlotSettingsMap({});
      setSelectedSlotKeys(new Set());
      setIsMouseDown(false);
      setShowLateHours(false);
      setWorkingHours({ start: "09:00", end: "21:00" });
      setTempWorkingHours({ start: "09:00", end: "21:00" });
      setIsRangeOpen(false);
      setIsConfirmClearOpen(false);
      setRepeatWeekly(true);
      setRepeatPeriod("2weeks");
      setRepeatUntil("");
      setIsDetailsDialogOpen(false);
      coverCrop.resetCrop();
    }
  }, [open, existingSlots, weekDates]);

  useEffect(() => {
    const up = () => setIsMouseDown(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const dict = {
    ru: {
      wizTitle: "Добавление слотов",
      step1: "Время",
      step2: "Настройки",
      showLateHours: "Показать поздние часы",
      hideLateHours: "Скрыть поздние часы",
      timeRange: "Диапазон часов",
      timezone: "Часовой пояс",
      start: "С",
      end: "По",
      apply: "Применить",
      weekDays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
      weekDaysFull: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
      twoWeeks: "2 недели",
      oneMonth: "1 месяц",
      twoMonths: "2 месяца",
      custom: "Свой",
      everyWeek: "Повторять расписание",
      repeatPeriodLabel: "Срок повторения:",
      repeatDaysLabel: "Дни для повторения:",
      repeatUntilLabel: "Повторять до даты:",
      lessonDuration: "Длительность урока",
      min: "мин",
      participants: "Количество участников",
      details: "Детали урока",
      cover: "Обложка",
      titleLabel: "Название",
      description: "Описание",
      location: "Местоположение",
      ready: "Готово",
      clearAll: "Очистить",
      confirmClearTitle: "Точно очистить все слоты?",
      cancel: "Отмена",
      confirm: "Очистить",
      noSlotsWarning: "Выберите хотя бы одну клетку",
      repeatSummary: "Расписание:",
      selectAll: "Выбрать все",
      unselectAll: "Снять выбор",
    },
    kk: {
      wizTitle: "Слоттар қосу",
      step1: "Уақыт",
      step2: "Баптаулар",
      showLateHours: "Кешкі сағаттарды көрсету",
      hideLateHours: "Кешкі сағаттарды жасыру",
      timeRange: "Сағат аралығы",
      timezone: "Уақыт белдеуі",
      start: "Басталуы",
      end: "Аяқталуы",
      apply: "Қолдану",
      weekDays: ["Дс", "Сс", "Ср", "Бс", "Жм", "Сн", "Жс"],
      weekDaysFull: ["Дүйсенбі", "Сейсенбі", "Сәрсенбі", "Бейсенбі", "Жұма", "Сенбі", "Жексенбі"],
      twoWeeks: "2 апта",
      oneMonth: "1 ай",
      twoMonths: "2 ай",
      custom: "Өзгерту",
      everyWeek: "Кестені қайталау",
      repeatPeriodLabel: "Қайталау мерзімі:",
      repeatDaysLabel: "Қайталанатын күндер:",
      repeatUntilLabel: "Күнге дейін қайталау:",
      lessonDuration: "Сабақ ұзақтығы",
      min: "мин",
      participants: "Қатысушылар саны",
      details: "Сабақ мәліметтері",
      cover: "Мұқаба",
      titleLabel: "Атауы",
      description: "Сипаттамасы",
      location: "Орналасу жері",
      ready: "Дайын",
      clearAll: "Тазарту",
      confirmClearTitle: "Барлық слоттарды тазарту керек пе?",
      cancel: "Болдырмау",
      confirm: "Тазарту",
      noSlotsWarning: "Кем дегенде бір ұяшықты таңдаңыз",
      repeatSummary: "Кесте:",
      selectAll: "Барлығын таңдау",
      unselectAll: "Таңдауды алып тастау",
    },
  };
  const t = dict[language];

  // Compute base hours between start and end
  const baseHours = useMemo(() => {
    const s = parseInt(workingHours.start.split(":")[0], 10) || 9;
    const e = parseInt(workingHours.end.split(":")[0], 10) || 21;

    if (s === e) return [s];

    const hours: number[] = [];
    let cur = s;
    while (cur !== e) {
      hours.push(cur);
      cur = (cur + 1) % 24;
      if (hours.length >= 24) break;
    }
    return hours;
  }, [workingHours]);

  // Late hours: continuation from workingHours.end up to 01:00 AM without missing hours
  const lateHoursArr = useMemo(() => {
    const e = parseInt(workingHours.end.split(":")[0], 10) || 21;
    const targetEnd = 1; // 01:00 AM
    if (e === targetEnd) return [];

    const hours: number[] = [];
    let cur = e;
    while (cur !== targetEnd) {
      if (!baseHours.includes(cur)) {
        hours.push(cur);
      }
      cur = (cur + 1) % 24;
      if (hours.length >= 24) break;
    }
    return hours;
  }, [workingHours.end, baseHours]);

  const displayHours = useMemo(() => {
    if (showLateHours && lateHoursArr.length > 0) {
      return [...baseHours, ...lateHoursArr];
    }
    return baseHours;
  }, [showLateHours, baseHours, lateHoursArr]);

  // Closing line at the bottom of the grid
  const closingHourStr = useMemo(() => {
    if (showLateHours && lateHoursArr.length > 0) {
      return "01:00";
    }
    return workingHours.end;
  }, [showLateHours, lateHoursArr, workingHours.end]);

  const toggleCell = (cellId: string) => {
    const dayIdx = parseInt(cellId.split("_")[0], 10);
    if (customDayIntervals[dayIdx]) {
      setCustomDayIntervals((prev) => {
        const copy = { ...prev };
        delete copy[dayIdx];
        return copy;
      });
    }

    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  };

  const handleCellMouseDown = (cellId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsMouseDown(true);
    const dayIdx = parseInt(cellId.split("_")[0], 10);
    if (customDayIntervals[dayIdx]) {
      setCustomDayIntervals((prev) => {
        const copy = { ...prev };
        delete copy[dayIdx];
        return copy;
      });
    }

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
    const dayIdx = parseInt(cellId.split("_")[0], 10);
    if (customDayIntervals[dayIdx]) {
      setCustomDayIntervals((prev) => {
        const copy = { ...prev };
        delete copy[dayIdx];
        return copy;
      });
    }

    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (dragMode === "select") next.add(cellId);
      else next.delete(cellId);
      return next;
    });
  };

  // Group 30-minute grid cells into continuous intervals
  const gridIntervalsByDay = useMemo(() => {
    const byDay: Record<number, { start: string; end: string }[]> = {};
    const add30 = (time: string) => {
      let [h, m] = time.split(":").map(Number);
      m += 30;
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
        if (dayTimes[i] === add30(curEnd)) {
          curEnd = dayTimes[i];
        } else {
          intervals.push({ start: curStart, end: add30(curEnd) });
          curStart = curEnd = dayTimes[i];
        }
      }
      intervals.push({ start: curStart, end: add30(curEnd) });
      byDay[day] = intervals;
    }
    return byDay;
  }, [selectedCells]);

  // Effective intervals
  const effectiveIntervalsByDay = useMemo(() => {
    const res: Record<number, { start: string; end: string }[]> = {};
    for (let day = 0; day < 7; day++) {
      if (customDayIntervals[day]) {
        res[day] = customDayIntervals[day];
      } else if (gridIntervalsByDay[day]) {
        res[day] = gridIntervalsByDay[day];
      }
    }
    return res;
  }, [customDayIntervals, gridIntervalsByDay]);

  const activeDays = useMemo(() => Object.keys(effectiveIntervalsByDay).map(Number), [effectiveIntervalsByDay]);

  // All slot keys in Step 2: `${dayIdx}_${start}_${end}`
  const allSlotKeys = useMemo(() => {
    const keys: string[] = [];
    activeDays.forEach((dayIdx) => {
      effectiveIntervalsByDay[dayIdx]?.forEach((interval) => {
        keys.push(`${dayIdx}_${interval.start}_${interval.end}`);
      });
    });
    return keys;
  }, [activeDays, effectiveIntervalsByDay]);

  // Default initial settings for when a slot is first clicked
  const createDefaultSlotSettings = (): SlotSettings => ({
    slotDuration: 60,
    maxParticipants: 1,
    title: "",
    description: "",
    imageUrl: "",
    location: "",
  });

  // When switching to step 2: by default nothing is selected!
  const handleStepChange = (newStep: 1 | 2) => {
    if (newStep === 2) {
      if (activeDays.length === 0) return;
      setRepeatDays(activeDays);
    }
    setStep(newStep);
  };

  // Update interval time in Step 1
  const updateIntervalTime = (
    dayIdx: number,
    intervalIndex: number,
    newStart: string,
    newEnd: string
  ) => {
    const current = effectiveIntervalsByDay[dayIdx] || [];
    const updated = current.map((item, idx) => {
      if (idx === intervalIndex) {
        return { start: newStart, end: newEnd };
      }
      return item;
    });
    setCustomDayIntervals((prev) => ({
      ...prev,
      [dayIdx]: updated,
    }));
  };

  // Helper to ensure slot settings exist with 60 min & 1 person default when chosen
  const ensureSlotInitialized = (key: string, currentMap: Record<string, SlotSettings>) => {
    if (!currentMap[key]) {
      return {
        ...currentMap,
        [key]: createDefaultSlotSettings(),
      };
    }
    return currentMap;
  };

  // Toggle selection of a specific slot key in Step 2
  const toggleSlotSelection = (key: string) => {
    setSlotSettingsMap((prev) => ensureSlotInitialized(key, prev));
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Toggle selection of all slots for a given day in Step 2
  const toggleDaySlotsSelection = (dayIdx: number) => {
    const dayKeys = (effectiveIntervalsByDay[dayIdx] || []).map(
      (it) => `${dayIdx}_${it.start}_${it.end}`
    );
    const allSelected = dayKeys.every((k) => selectedSlotKeys.has(k));

    setSlotSettingsMap((prev) => {
      let map = { ...prev };
      dayKeys.forEach((k) => {
        map = ensureSlotInitialized(k, map);
      });
      return map;
    });

    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        dayKeys.forEach((k) => next.delete(k));
      } else {
        dayKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  // Select all slots across all days
  const handleSelectAllSlots = () => {
    setSlotSettingsMap((prev) => {
      let map = { ...prev };
      allSlotKeys.forEach((k) => {
        map = ensureSlotInitialized(k, map);
      });
      return map;
    });
    setSelectedSlotKeys(new Set(allSlotKeys));
  };

  // Check if a day has all its slots selected
  const isDayFullySelected = (dayIdx: number) => {
    const dayKeys = (effectiveIntervalsByDay[dayIdx] || []).map(
      (it) => `${dayIdx}_${it.start}_${it.end}`
    );
    return dayKeys.length > 0 && dayKeys.every((k) => selectedSlotKeys.has(k));
  };

  // Update a field for ALL currently selected slot keys
  const updateSelectedSlotsField = <K extends keyof SlotSettings>(
    field: K,
    value: SlotSettings[K]
  ) => {
    if (selectedSlotKeys.size === 0) return;
    setSlotSettingsMap((prev) => {
      const copy = { ...prev };
      selectedSlotKeys.forEach((key) => {
        const current = copy[key] || createDefaultSlotSettings();
        copy[key] = {
          ...current,
          [field]: value,
        };
      });
      return copy;
    });
  };

  // Current values to show in right panel: if nothing selected, empty!
  const currentPanelSettings = useMemo((): SlotSettings | null => {
    if (selectedSlotKeys.size === 0) return null;
    const firstKey = Array.from(selectedSlotKeys)[0];
    return slotSettingsMap[firstKey] || createDefaultSlotSettings();
  }, [selectedSlotKeys, slotSettingsMap]);

  const handleReady = () => {
    if (activeDays.length === 0) {
      onOpenChange(false);
      return;
    }

    // Prepare daySlots with per-slot settings
    const daySlotsPayload: Record<
      number,
      {
        start: string;
        end: string;
        slotDuration?: number;
        maxParticipants?: number;
        title?: string;
        description?: string;
        imageUrl?: string;
        location?: string;
      }[]
    > = {};

    activeDays.forEach((dayIdx) => {
      const intervals = effectiveIntervalsByDay[dayIdx] || [];
      daySlotsPayload[dayIdx] = intervals.map((interval) => {
        const key = `${dayIdx}_${interval.start}_${interval.end}`;
        const settings = slotSettingsMap[key] || createDefaultSlotSettings();
        return {
          start: interval.start,
          end: interval.end,
          slotDuration: settings.slotDuration || 60,
          maxParticipants: settings.maxParticipants || 1,
          title: settings.title.trim() || undefined,
          description: settings.description.trim() || undefined,
          imageUrl: settings.imageUrl.trim() || undefined,
          location: settings.location.trim() || undefined,
        };
      });
    });

    const allIntervals = Object.values(effectiveIntervalsByDay).flat();

    onCreateSlots({
      daySlots: daySlotsPayload,
      timeIntervals: allIntervals,
      repeatDays: repeatWeekly ? repeatDays : activeDays,
      repeatWeekly,
      repeatPeriod: repeatWeekly ? repeatPeriod : null,
      repeatUntil: repeatWeekly && repeatPeriod === "custom" ? repeatUntil : null,
      slotDuration: currentPanelSettings?.slotDuration || 60,
      maxParticipants: currentPanelSettings?.maxParticipants || 1,
      title: currentPanelSettings?.title.trim() || undefined,
      description: currentPanelSettings?.description.trim() || undefined,
      imageUrl: currentPanelSettings?.imageUrl.trim() || undefined,
      location: currentPanelSettings?.location.trim() || undefined,
    });
  };

  const handleToggleLateHours = () => {
    if (showLateHours) {
      setShowLateHours(false);
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({
          top: savedScrollTopRef.current,
          behavior: "smooth",
        });
      }, 50);
    } else {
      savedScrollTopRef.current = scrollContainerRef.current?.scrollTop || 0;
      setShowLateHours(true);
    }
  };

  // 30-min hour row
  const renderHourRow = (h: number) => {
    const hourStr = String(h).padStart(2, "0");
    const halfHours = [0, 30];

    return (
      <div key={h} className="grid grid-cols-[70px_repeat(7,1fr)] relative">
        <div className="relative border-r border-border/60 select-none">
          <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">
            {hourStr}:00
          </span>
        </div>
        {Array.from({ length: 7 }).map((_, dayIdx) => (
          <div key={dayIdx} className="border-r last:border-r-0 border-border/60 flex flex-col">
            {halfHours.map((m) => {
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
                      ? "bg-primary/80 border-t border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]"
                      : "hover:bg-primary/20 active:bg-primary/30"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const lateMaxHeight = lateHoursArr.length * 2 * 24 + 32;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-full h-full max-h-full m-0 p-0 rounded-none sm:rounded-none flex flex-col bg-background overflow-hidden border-0 gap-0 z-50"
      >
        <VisuallyHidden>
          <DialogTitle>Slot Creation Wizard</DialogTitle>
        </VisuallyHidden>

        {/* Top Header: Title (left) | Step Switcher (strictly centered) | Ready (far right, no cross) */}
        <header className="flex-none relative flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-card">
          {/* Left: Wizard title */}
          <div className="flex items-center gap-3">
            <h2 className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">
              {t.wizTitle}
            </h2>
          </div>

          {/* Center on desktop: 2-step switcher strictly in center */}
          <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center justify-center pointer-events-auto">
            <div className="flex items-center gap-2 bg-muted/60 p-1.5 rounded-full border border-border/50">
              <button
                type="button"
                onClick={() => handleStepChange(1)}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                  step === 1
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                    step === 1 ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                  )}
                >
                  1
                </span>
                <span>{t.step1}</span>
              </button>

              <button
                type="button"
                onClick={() => handleStepChange(2)}
                disabled={activeDays.length === 0}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                  step === 2
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                    step === 2 ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                  )}
                >
                  2
                </span>
                <span>{t.step2}</span>
              </button>
            </div>
          </div>

          {/* Right: "Готово" button pinned strictly to the far right corner */}
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              className="h-8 sm:h-9 px-4 sm:px-5 text-xs sm:text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              onClick={handleReady}
              disabled={isPending}
            >
              {isPending ? "..." : t.ready}
            </Button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-auto pb-20 sm:pb-8">
          {/* STEP 1: Time Selection */}
          {step === 1 && (
            <div className="flex gap-5 p-2 sm:p-4 min-w-[750px]">
              {/* Left: Schedule grid */}
              <div className="flex-1 min-w-0">
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none">
                  {/* Grid header with days */}
                  <div className="grid grid-cols-[70px_repeat(7,1fr)] bg-muted/50 border-b border-border sticky top-0 z-10">
                    <div className="py-2.5 px-1 text-center text-[10px] sm:text-[11px] font-semibold text-muted-foreground border-r border-border/60 flex items-center justify-center">
                      {t.timezone}
                    </div>
                    {t.weekDays.map((dayName, idx) => {
                      const date = weekDates[idx];
                      const isCur = isSameDay(date, new Date());
                      const hasSlots = Boolean(effectiveIntervalsByDay[idx] && effectiveIntervalsByDay[idx].length > 0);
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "py-2 px-1 text-center border-r last:border-r-0 border-border/60 flex flex-col items-center justify-center transition-colors",
                            hasSlots && "bg-primary/5"
                          )}
                        >
                          <span className="text-[11px] font-semibold text-muted-foreground">{dayName}</span>
                          <div
                            className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5",
                              isCur
                                ? "bg-primary text-primary-foreground"
                                : hasSlots
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

                  {/* Spacer */}
                  <div className="grid grid-cols-[70px_repeat(7,1fr)] bg-muted/10">
                    <div className="border-r border-border/60 h-2 sm:h-2.5" />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="border-r last:border-r-0 border-border/60 h-2 sm:h-2.5" />
                    ))}
                  </div>

                  {/* Hours rows */}
                  <div className="bg-card">
                    {baseHours.map(renderHourRow)}

                    {/* Late hours */}
                    <div
                      className="overflow-hidden transition-[max-height] duration-700 ease-in-out"
                      style={{
                        maxHeight: showLateHours ? `${lateMaxHeight}px` : "0px",
                        paddingTop: showLateHours ? "10px" : "0px",
                        marginTop: showLateHours ? "-10px" : "0px",
                      }}
                    >
                      {lateHoursArr.map(renderHourRow)}
                    </div>

                    {/* Final closing line */}
                    <div className="grid grid-cols-[70px_repeat(7,1fr)] relative">
                      <div className="relative border-r border-border/60 h-3 select-none">
                        <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">
                          {closingHourStr}
                        </span>
                      </div>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={i}
                          className="border-r last:border-r-0 border-border/60 border-t border-border/70 h-3"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom toolbar under grid */}
                <div className="flex items-center justify-between mt-3 mb-2 px-1">
                  {/* Left: Time range */}
                  <div className="w-[140px] flex justify-start">
                    <Popover
                      open={isRangeOpen}
                      onOpenChange={(nextOpen) => {
                        setIsRangeOpen(nextOpen);
                        if (nextOpen) {
                          setTempWorkingHours(workingHours);
                        } else {
                          setWorkingHours(tempWorkingHours);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 gap-1.5 rounded-md px-3 font-medium border-border text-foreground bg-card hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-sm transition-colors group"
                        >
                          <Clock className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary-foreground transition-colors" />
                          <span>{t.timeRange}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3.5 shadow-lg border-border" align="start">
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-foreground">{t.timeRange}</h4>
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{t.start}</Label>
                              <Input
                                type="time"
                                value={tempWorkingHours.start}
                                onChange={(e) =>
                                  setTempWorkingHours((prev) => ({ ...prev, start: e.target.value }))
                                }
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{t.end}</Label>
                              <Input
                                type="time"
                                value={tempWorkingHours.end}
                                onChange={(e) =>
                                  setTempWorkingHours((prev) => ({ ...prev, end: e.target.value }))
                                }
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="w-full h-7 text-xs mt-1"
                            onClick={() => {
                              setWorkingHours(tempWorkingHours);
                              setIsRangeOpen(false);
                            }}
                          >
                            {t.apply}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Center: Toggle late hours */}
                  {lateHoursArr.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleToggleLateHours}
                      className="text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 hover:border-primary/40 gap-1.5 rounded-full px-4 py-1.5 border-dashed transition-all"
                    >
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 transition-transform duration-300",
                          showLateHours && "rotate-180"
                        )}
                      />
                      <span>{showLateHours ? t.hideLateHours : t.showLateHours}</span>
                    </Button>
                  )}

                  {/* Right: Clear all with popover */}
                  <div className="w-[140px] flex justify-end">
                    {activeDays.length > 0 && (
                      <Popover open={isConfirmClearOpen} onOpenChange={setIsConfirmClearOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 rounded-full px-3"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t.clearAll}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-3 text-center space-y-2.5 shadow-lg" align="end">
                          <p className="text-xs font-medium text-foreground">{t.confirmClearTitle}</p>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => setIsConfirmClearOpen(false)}
                            >
                              {t.cancel}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => {
                                setSelectedCells(new Set());
                                setCustomDayIntervals({});
                                setSlotSettingsMap({});
                                setSelectedSlotKeys(new Set());
                                setIsConfirmClearOpen(false);
                              }}
                            >
                              {t.confirm}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Summary panel — "Расписание:" */}
              <div className="w-72 sm:w-80 md:w-96 flex-none">
                <div className="sticky top-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-base sm:text-[17px] font-medium text-foreground">
                      {t.repeatSummary}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {activeDays.length === 0 ? (
                      <div className="p-4 border rounded-xl text-center text-xs sm:text-sm text-muted-foreground border-dashed bg-card/50">
                        {t.noSlotsWarning}
                      </div>
                    ) : (
                      activeDays.map((dayIdx) => (
                        <div
                          key={dayIdx}
                          className="p-2.5 sm:p-3 rounded-xl border border-border bg-card shadow-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium text-foreground">
                              {t.weekDaysFull[dayIdx]}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {effectiveIntervalsByDay[dayIdx]?.map((interval, i) => (
                              <div
                                key={i}
                                className="text-xs font-mono gap-0.5 px-2 py-0.5 rounded-md border border-border/70 bg-muted/60 hover:bg-muted items-center flex"
                              >
                                <EditableTime
                                  time={interval.start}
                                  onChange={(newTime) =>
                                    updateIntervalTime(dayIdx, i, newTime, interval.end)
                                  }
                                />
                                <span className="mx-0.5 text-muted-foreground">–</span>
                                <EditableTime
                                  time={interval.end}
                                  onChange={(newTime) =>
                                    updateIntervalTime(dayIdx, i, interval.start, newTime)
                                  }
                                />
                              </div>
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

          {/* STEP 2: Configure Slot Groups */}
          {step === 2 && (
            <div className="max-w-5xl mx-auto p-4 sm:p-6 w-full">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_380px] gap-6 items-start">
                {/* Left: Day & Slot Groups List (independently scrollable on desktop) */}
                <div className="space-y-3.5 md:max-h-[calc(100vh-120px)] md:overflow-y-auto md:pr-2">
                  <div className="pb-1 border-b">
                    <h3 className="text-base font-semibold text-foreground">
                      {t.repeatSummary}
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {activeDays.map((dayIdx) => {
                      const isFullDay = isDayFullySelected(dayIdx);

                      return (
                        <div
                          key={dayIdx}
                          className="p-3.5 rounded-xl border border-border bg-card shadow-sm space-y-3"
                        >
                          {/* Day header with clickable circle */}
                          <div className="flex items-center justify-between">
                            <div
                              onClick={() => toggleDaySlotsSelection(dayIdx)}
                              className="flex items-center gap-2.5 cursor-pointer select-none group"
                            >
                              {/* Round circle for day */}
                              <div
                                className={cn(
                                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                                  isFullDay
                                    ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                    : "border-muted-foreground/40 group-hover:border-primary/60 bg-background"
                                )}
                              >
                                {isFullDay && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>

                              <span className="text-sm sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                                {t.weekDaysFull[dayIdx]}
                              </span>
                            </div>
                          </div>

                          {/* Slot intervals list */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {effectiveIntervalsByDay[dayIdx]?.map((interval) => {
                              const key = `${dayIdx}_${interval.start}_${interval.end}`;
                              const isSelected = selectedSlotKeys.has(key);
                              const settings = slotSettingsMap[key];

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => toggleSlotSelection(key)}
                                  className={cn(
                                    "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-mono transition-all border cursor-pointer select-none text-left",
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary font-semibold shadow-sm ring-2 ring-primary/20 scale-[1.02]"
                                      : "bg-muted/60 text-foreground border-border/80 hover:bg-muted hover:border-border"
                                  )}
                                >
                                  {/* Small circle indicator */}
                                  <span
                                    className={cn(
                                      "w-4 h-4 rounded-full border flex items-center justify-center flex-none",
                                      isSelected
                                        ? "border-primary-foreground bg-primary-foreground text-primary"
                                        : "border-muted-foreground/50 bg-background"
                                    )}
                                  >
                                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                  </span>

                                  <span>
                                    {interval.start} – {interval.end}
                                  </span>

                                  {/* Mini badge showing settings if configured */}
                                  {settings?.slotDuration && (
                                    <span
                                      className={cn(
                                        "text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-sans",
                                        isSelected
                                          ? "bg-primary-foreground/20 text-primary-foreground"
                                          : "bg-background text-muted-foreground border border-border/40"
                                      )}
                                    >
                                      {settings.slotDuration} {t.min} • {settings.maxParticipants || 1} чел
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Buttons under schedule: Select all (left, white with orange hover) | Deselect (right) */}
                  <div className="flex items-center justify-end gap-2.5 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllSlots}
                      className="text-xs sm:text-sm h-8 px-3.5 bg-card text-foreground border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors shadow-2xs font-medium"
                    >
                      {t.selectAll}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSlotKeys(new Set())}
                      className="text-xs sm:text-sm h-8 px-3.5 text-destructive hover:text-destructive hover:bg-destructive/10 font-medium"
                    >
                      {t.unselectAll}
                    </Button>
                  </div>
                </div>

                {/* Right Column: Settings Card + Repetition Card (stationary on desktop) */}
                <div className="w-full space-y-3 self-start md:sticky md:top-0 pb-6">
                  {/* Settings Card for selected slot groups */}
                  <div className="bg-card border border-border p-4 sm:p-4.5 rounded-2xl shadow-sm space-y-3.5">
                    {/* Duration with orange asterisk: field first, then buttons to the right */}
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-semibold text-foreground flex items-center">
                        {t.lessonDuration}
                        <ReqStar />
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder={t.custom}
                          disabled={selectedSlotKeys.size === 0}
                          value={currentPanelSettings?.customDuration || ""}
                          className={cn(
                            "h-9 text-xs sm:text-sm font-medium w-1/2 text-center rounded-md border border-input bg-background outline-none transition-colors",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            "focus:border-primary focus:ring-1 focus:ring-primary/20",
                            currentPanelSettings?.customDuration && "border-primary font-semibold text-primary"
                          )}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateSelectedSlotsField("customDuration", val);
                            if (val && Number(val) > 0) {
                              updateSelectedSlotsField("slotDuration", Number(val));
                            }
                          }}
                        />
                        {[60, 90].map((dur) => {
                          const isActive = currentPanelSettings?.slotDuration === dur && !currentPanelSettings?.customDuration;

                          return (
                            <Button
                              key={dur}
                              type="button"
                              disabled={selectedSlotKeys.size === 0}
                              variant={isActive ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                updateSelectedSlotsField("customDuration", "");
                                updateSelectedSlotsField("slotDuration", dur);
                              }}
                              className={cn(
                                "h-9 flex-1 px-2.5 sm:px-3 text-xs sm:text-sm transition-all",
                                isActive && "bg-primary text-primary-foreground font-semibold shadow-sm"
                              )}
                            >
                              <span>{dur} {t.min}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Participants with orange asterisk: field first, then buttons to the right */}
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-semibold text-foreground flex items-center">
                        {t.participants}
                        <ReqStar />
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          placeholder={t.custom}
                          disabled={selectedSlotKeys.size === 0}
                          value={currentPanelSettings?.customParticipants || ""}
                          className={cn(
                            "h-9 text-xs sm:text-sm font-medium w-20 sm:w-24 text-center rounded-md border border-input bg-background outline-none transition-colors",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            "focus:border-primary focus:ring-1 focus:ring-primary/20",
                            currentPanelSettings?.customParticipants && "border-primary font-semibold text-primary"
                          )}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateSelectedSlotsField("customParticipants", val);
                            if (val && Number(val) > 0) {
                              updateSelectedSlotsField("maxParticipants", Number(val));
                            }
                          }}
                        />
                        {[1, 3, 5, 10].map((count) => {
                          const isActive = currentPanelSettings?.maxParticipants === count && !currentPanelSettings?.customParticipants;

                          return (
                            <Button
                              key={count}
                              type="button"
                              disabled={selectedSlotKeys.size === 0}
                              variant={isActive ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                updateSelectedSlotsField("customParticipants", "");
                                updateSelectedSlotsField("maxParticipants", count);
                              }}
                              className={cn(
                                "h-9 flex-1 px-2 text-xs sm:text-sm transition-all",
                                isActive && "bg-primary text-primary-foreground font-semibold shadow-sm"
                              )}
                            >
                              <span>{count}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Lesson Details Dialog Button with gray pencil */}
                    <div className="pt-0.5">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={selectedSlotKeys.size === 0}
                        onClick={() => setIsDetailsDialogOpen(true)}
                        className="w-full justify-between h-9 px-3.5 border-border hover:border-primary/50 hover:bg-muted/50 transition-all"
                      >
                        <span className="text-xs sm:text-sm font-semibold text-foreground">
                          {t.details}
                        </span>
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  {/* Separate Repetition Card under Settings Card */}
                  <div className="p-4 sm:p-4.5 rounded-2xl border border-border bg-card shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="repeat-switch" className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground flex items-center">
                        {t.everyWeek}
                        <ReqStar />
                      </Label>
                      <Switch
                        id="repeat-switch"
                        checked={repeatWeekly}
                        onCheckedChange={setRepeatWeekly}
                      />
                    </div>

                    {repeatWeekly && (
                      <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-3.5 animate-in fade-in zoom-in-95">
                        {/* Day circles */}
                        <div className="space-y-1.5">
                          <Label className="text-xs sm:text-sm font-semibold text-foreground">
                            {t.repeatDaysLabel}
                          </Label>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {dict[language].weekDays.map((dayName, idx) => {
                              const isDaySelected = repeatDays.includes(idx);
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setRepeatDays((prev) =>
                                      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
                                    );
                                  }}
                                  className={cn(
                                    "w-8 h-8 sm:w-9 sm:h-9 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center transition-all cursor-pointer",
                                    isDaySelected
                                      ? "bg-primary text-primary-foreground shadow-sm"
                                      : "bg-background text-muted-foreground border border-border/80 hover:border-primary/50"
                                  )}
                                >
                                  {dayName}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Repeat period buttons */}
                        <div className="space-y-1.5">
                          <Label className="text-xs sm:text-sm font-semibold text-foreground">
                            {t.repeatPeriodLabel}
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            {(["2weeks", "1month", "2months", "custom"] as const).map((period) => (
                              <Button
                                key={period}
                                type="button"
                                variant={repeatPeriod === period ? "default" : "outline"}
                                size="sm"
                                onClick={() => setRepeatPeriod(period)}
                                className={cn(
                                  "h-9 text-xs sm:text-sm font-semibold",
                                  repeatPeriod === period && "bg-primary text-primary-foreground font-semibold"
                                )}
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
                        </div>

                        {repeatPeriod === "custom" && (
                          <div className="space-y-1.5 pt-0.5">
                            <Label className="text-xs sm:text-sm font-semibold text-foreground">{t.repeatUntilLabel}</Label>
                            <Input
                              type="date"
                              min={format(new Date(), "yyyy-MM-dd")}
                              max="9999-12-31"
                              value={repeatUntil}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) {
                                  setRepeatUntil("");
                                  return;
                                }
                                const parts = val.split("-");
                                if (parts[0] && parts[0].length > 4) {
                                  parts[0] = parts[0].slice(0, 4);
                                  setRepeatUntil(parts.join("-"));
                                } else {
                                  setRepeatUntil(val);
                                }
                              }}
                              className="h-9 text-xs sm:text-sm bg-background rounded-lg"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lesson Details Dialog (Modal like in product creation) */}
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent hideCloseButton className="max-w-lg sm:max-w-xl w-full p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4">
            {/* Header: Title (left) | Close cross (right) */}
            <div className="flex items-center justify-between pb-1 border-b border-border/50">
              <DialogTitle className="text-base sm:text-lg font-semibold text-foreground">
                {t.details}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => setIsDetailsDialogOpen(false)}
                title="Закрыть"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3.5">
              {/* 1. Cover Area (Photos only, with cropper when selecting) */}
              <div className="space-y-1.5">
                <Label className="text-sm sm:text-base font-semibold text-foreground">
                  {t.cover}
                </Label>

                {Boolean(coverCrop.source) ? (
                  <div className="py-1">
                    <CoverCropEditor
                      source={coverCrop.source!}
                      mediaType={coverCrop.mediaType}
                      previewStyle={coverCrop.previewStyle}
                      zoom={coverCrop.zoom}
                      onZoom={coverCrop.setZoom}
                      onPointerDown={coverCrop.onPointerDown}
                      onPointerMove={coverCrop.onPointerMove}
                      onPointerUp={coverCrop.onPointerUp}
                      saving={cropSaving}
                      onCancel={() => {
                        coverCrop.resetCrop();
                      }}
                      onSave={() => void handleSaveCrop()}
                    />
                  </div>
                ) : currentPanelSettings?.imageUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-border h-40 sm:h-44 w-full bg-muted/30 group">
                    <img
                      src={currentPanelSettings.imageUrl}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                    {/* Replace in bottom-left corner */}
                    <label
                      className="absolute bottom-2 left-2 cursor-pointer bg-background/90 hover:bg-background text-foreground h-8 w-8 rounded-lg shadow-md flex items-center justify-center border border-border/80 transition-all hover:border-primary/50"
                      title={language === "ru" ? "Заменить" : "Ауыстыру"}
                    >
                      <Pencil className="w-4 h-4 text-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            coverCrop.loadFile(file);
                          }
                        }}
                      />
                    </label>
                    {/* Trash in bottom-right corner */}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute bottom-2 right-2 h-8 w-8 rounded-lg shadow-md"
                      onClick={() => updateSelectedSlotsField("imageUrl", "")}
                      title={language === "ru" ? "Удалить" : "Жою"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center h-40 sm:h-44 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl cursor-pointer hover:bg-muted/30 transition-all">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
                      <Plus className="w-7 h-7 sm:w-8 sm:h-8" />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          coverCrop.loadFile(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* 2. Title field */}
              <div className="space-y-1.5">
                <Label className="text-sm sm:text-base font-semibold text-foreground">
                  {t.titleLabel}
                </Label>
                <Input
                  value={currentPanelSettings?.title || ""}
                  placeholder={language === "ru" ? "Например: Английский для начинающих" : "Мысалы: Бастаушыларға ағылшын тілі"}
                  onChange={(e) => updateSelectedSlotsField("title", e.target.value)}
                  className="h-9 sm:h-10 text-sm rounded-xl"
                />
              </div>

              {/* 3. Description field */}
              <div className="space-y-1.5">
                <Label className="text-sm sm:text-base font-semibold text-foreground">
                  {t.description}
                </Label>
                <Textarea
                  rows={3}
                  value={currentPanelSettings?.description || ""}
                  placeholder={language === "ru" ? "Кратко опишите тему занятия, план урока или требования к участникам..." : "Сабақтың тақырыбы мен жоспарын жазыңыз..."}
                  onChange={(e) => updateSelectedSlotsField("description", e.target.value)}
                  className="min-h-[80px] text-sm rounded-xl resize-y"
                />
              </div>

              {/* 4. Location field */}
              <div className="space-y-1.5">
                <Label className="text-sm sm:text-base font-semibold text-foreground">
                  {t.location}
                </Label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    value={currentPanelSettings?.location || ""}
                    placeholder={
                      language === "ru"
                        ? "Напишите адрес, если мероприятие пройдет оффлайн"
                        : "Іс-шара оффлайн өтсе, мекенжайын жазыңыз"
                    }
                    onChange={(e) => updateSelectedSlotsField("location", e.target.value)}
                    className="h-9 sm:h-10 text-sm rounded-xl pl-9"
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Mobile bottom bar for step switching */}
        <div className="flex sm:hidden fixed bottom-0 left-0 right-0 z-30 items-center justify-center py-2.5 px-4 border-t bg-card/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2 bg-muted/70 p-1.5 rounded-full border border-border/50">
            <button
              type="button"
              onClick={() => handleStepChange(1)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all",
                step === 1 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                  step === 1 ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                )}
              >
                1
              </span>
              <span>{t.step1}</span>
            </button>
            <button
              type="button"
              onClick={() => handleStepChange(2)}
              disabled={activeDays.length === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all disabled:opacity-40",
                step === 2 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                  step === 2 ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                )}
              >
                2
              </span>
              <span>{t.step2}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
