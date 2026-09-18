import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, ChevronDown, Trash2, Check, MapPin, Plus, X, Pencil, Calendar as CalendarIcon, Timer, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { format, addDays, startOfWeek, isSameDay, parseISO, isValid } from "date-fns";
import { ru, kk } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
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
    repeatPeriod: "1week" | "1month" | "2months" | "custom" | null;
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

  // Step 2: Global repetition settings (default: off)
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([0, 1, 2, 3, 4]); // Mon-Fri
  const [repeatPeriod, setRepeatPeriod] = useState<"1week" | "1month" | "2months" | "custom" | null>("1week");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [isCustomRepeatDialogOpen, setIsCustomRepeatDialogOpen] = useState(false);
  const [repeatDay, setRepeatDay] = useState("");
  const [repeatMonth, setRepeatMonth] = useState("");
  const [repeatYear, setRepeatYear] = useState("");
  const dayInputRef = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);

  const isPastOrToday = (date: Date) => {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return date <= todayEnd;
  };

  const updateRepeatUntilFromParts = (d: string, m: string, y: string) => {
    if (d && m && y && y.length === 4) {
      const dayNum = parseInt(d, 10);
      const monthNum = parseInt(m, 10);
      const yearNum = parseInt(y, 10);
      if (
        monthNum >= 1 &&
        monthNum <= 12 &&
        dayNum >= 1 &&
        dayNum <= 31 &&
        yearNum >= 2024 &&
        yearNum <= 2099
      ) {
        const testDate = new Date(yearNum, monthNum - 1, dayNum);
        if (isValid(testDate) && testDate.getDate() === dayNum && !isPastOrToday(testDate)) {
          const iso = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          setRepeatUntil(iso);
          return;
        }
      }
    }
    setRepeatUntil("");
  };

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
      setRepeatWeekly(false);
      setRepeatPeriod("1week");
      setRepeatUntil("");
      setIsCustomRepeatDialogOpen(false);
      setRepeatDay("");
      setRepeatMonth("");
      setRepeatYear("");
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
      oneWeek: "1 неделя",
      oneMonth: "1 месяц",
      twoMonths: "2 месяца",
      custom: "Свой",
      customValue: "Своё",
      everyWeek: "Повторять уроки",
      repeatScheduleTitle: "Расписание",
      slotParams: "Параметры слотов",
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
      oneWeek: "1 апта",
      oneMonth: "1 ай",
      twoMonths: "2 ай",
      custom: "Өзгерту",
      customValue: "Өзім",
      everyWeek: "Сабақтарды қайталау",
      repeatScheduleTitle: "Кесте",
      slotParams: "Слот баптаулары",
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
      setLateHoursOverflowVisible(false);
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
    const isFirstLateHour = lateHoursArr.length > 0 && h === lateHoursArr[0];

    return (
      <div key={h} className="grid grid-cols-[70px_repeat(7,1fr)] relative">
        <div className="relative border-r border-border/60 select-none">
          {!isFirstLateHour && (
            <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">
              {hourStr}:00
            </span>
          )}
        </div>
        {Array.from({ length: 7 }).map((_, dayIdx) => (
          <div key={dayIdx} className="border-r last:border-r-0 border-foreground/35 flex flex-col">
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
                    m === 0 ? "border-t border-foreground/35" : "border-t border-border/75",
                    isSelected
                      ? "bg-primary border-t border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]"
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
                      <div key={i} className="border-r last:border-r-0 border-foreground/35 h-2 sm:h-2.5" />
                    ))}
                  </div>

                  {/* Hours rows */}
                  <div className="bg-card">
                    {baseHours.map(renderHourRow)}

                    {/* Stationary boundary label (e.g. 21:00) */}
                    <div className="relative grid grid-cols-[70px_repeat(7,1fr)] select-none pointer-events-none">
                      <div className="relative border-r border-border/60 h-0">
                        <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">
                          {workingHours.end}
                        </span>
                      </div>
                    </div>

                    {/* Late hours */}
                    <div
                      className="overflow-hidden transition-[max-height] duration-700 ease-in-out"
                      style={{
                        maxHeight: showLateHours ? `${lateMaxHeight}px` : "0px",
                      }}
                    >
                      {lateHoursArr.map(renderHourRow)}
                    </div>

                    {/* Final closing line */}
                    <div className="grid grid-cols-[70px_repeat(7,1fr)] relative">
                      <div className="relative border-r border-border/60 h-3 select-none">
                        {showLateHours && lateHoursArr.length > 0 && (
                          <span className="absolute top-0 -translate-y-1/2 right-2 text-[11px] font-mono text-muted-foreground">
                            {closingHourStr}
                          </span>
                        )}
                      </div>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={i}
                          className="border-r last:border-r-0 border-foreground/35 border-t border-foreground/35 h-3"
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
            <div
              onClick={() => setSelectedSlotKeys(new Set())}
              className="flex gap-5 p-2 sm:p-4 min-w-[750px]"
            >
              {/* Left: Schedule Grid with continuous interval blocks */}
              <div className="flex-1 min-w-0">
                <div
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setSelectedSlotKeys(new Set());
                    }
                  }}
                  className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none"
                >
                  {/* 7 Days Header (Mon-Sun) */}
                  <div className="grid grid-cols-7 bg-muted/50 border-b border-border sticky top-0 z-10">
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

                  {/* Timeline Grid with solid blocks without square splits */}
                  <div
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setSelectedSlotKeys(new Set());
                      }
                    }}
                    className="relative bg-card"
                    style={{
                      height: `${Math.max(360, displayHours.length * 48)}px`,
                    }}
                  >
                    {/* Background horizontal hour lines */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col">
                      {displayHours.map((_, i) => (
                        <div
                          key={i}
                          className="border-b last:border-b-0 border-foreground/35"
                          style={{ height: "48px" }}
                        />
                      ))}
                    </div>

                    {/* 7 Day Columns */}
                    <div className="relative grid grid-cols-7 h-full divide-x divide-foreground/35">
                      {Array.from({ length: 7 }).map((_, dayIdx) => {
                        const intervals = effectiveIntervalsByDay[dayIdx] || [];
                        const startHour = displayHours[0] ?? 9;

                        const getMinutesFromStart = (timeStr: string) => {
                          const [h, m] = timeStr.split(":").map(Number);
                          let diffHours = h - startHour;
                          if (diffHours < 0) diffHours += 24;
                          return diffHours * 60 + m;
                        };

                        return (
                          <div
                            key={dayIdx}
                            onClick={(e) => {
                              if (e.target === e.currentTarget) {
                                setSelectedSlotKeys(new Set());
                              }
                            }}
                            className="relative h-full"
                          >
                            {intervals.map((interval) => {
                              const key = `${dayIdx}_${interval.start}_${interval.end}`;
                              const isSelected = selectedSlotKeys.has(key);

                              const startM = getMinutesFromStart(interval.start);
                              let endM = getMinutesFromStart(interval.end);
                              if (endM <= startM) {
                                endM += 24 * 60;
                              }
                              const durationM = Math.max(30, endM - startM);
                              const pixelsPerMinute = 48 / 60;
                              const topPx = startM * pixelsPerMinute;
                              const heightPx = Math.max(44, durationM * pixelsPerMinute);

                              return (
                                <div
                                  key={key}
                                  onClick={(e) => {
                                   e.stopPropagation();
                                   toggleSlotSelection(key);
                                  }}
                                  style={{
                                    top: `${topPx + 2}px`,
                                    height: `${heightPx - 4}px`,
                                  }}
                                  className={cn(
                                    "group absolute left-1 right-1 rounded-xl transition-all cursor-pointer select-none flex items-center justify-center p-1.5 text-center overflow-hidden",
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-2 border-primary shadow-md ring-2 ring-primary/30 z-20 scale-[1.01]"
                                      : "bg-card text-primary border-2 border-primary/40 hover:border-primary/60 z-10"
                                  )}
                                  title={`${interval.start} - ${interval.end}`}
                                >
                                  {!isSelected && (
                                    <div className="absolute inset-0 bg-primary/15 group-hover:bg-primary/25 transition-colors pointer-events-none" />
                                  )}
                                  <span className="relative z-10 font-mono font-bold text-xs sm:text-sm leading-tight">
                                    {interval.start} – {interval.end}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Buttons under schedule: Select all (left) | Deselect (right) */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-between mt-3 mb-2 px-1"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectAllSlots();
                    }}
                    className="text-xs sm:text-sm h-8 px-3.5 bg-card text-foreground border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors shadow-2xs font-medium"
                  >
                    {t.selectAll}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={selectedSlotKeys.size === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSlotKeys(new Set());
                    }}
                    className="text-xs sm:text-sm h-8 px-3.5 text-destructive hover:text-destructive hover:bg-destructive/10 font-medium disabled:opacity-30"
                  >
                    {t.unselectAll}
                  </Button>
                </div>
              </div>

              {/* Right Column: Settings Card + Repetition Card (stationary on desktop) */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-72 sm:w-80 md:w-96 flex-none"
              >
                <div className="sticky top-4 space-y-3.5">
                  {/* Title above Slot Parameters */}
                  <div className="flex items-center justify-between">
                    <p className="text-base sm:text-[17px] font-medium text-foreground">
                      {t.slotParams}
                    </p>
                  </div>

                  {/* Settings Card for selected slot groups */}
                  <div
                    className={cn(
                      "bg-card border p-4 sm:p-4.5 rounded-2xl shadow-sm space-y-3.5 transition-all",
                      selectedSlotKeys.size > 0
                        ? "border-primary/40 ring-1 ring-primary/20 opacity-100"
                        : "border-border/60 opacity-60"
                    )}
                  >
                    {/* Duration with orange asterisk: field first, then buttons to the right */}
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Timer className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.lessonDuration}</span>
                        <ReqStar />
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder={t.customValue}
                          disabled={selectedSlotKeys.size === 0}
                          value={currentPanelSettings?.customDuration || ""}
                          className={cn(
                            "h-11 min-h-[44px] text-xs sm:text-sm font-semibold flex-1 text-center rounded-lg border border-input bg-background outline-none transition-colors",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            "focus:border-primary focus:ring-2 focus:ring-primary/20",
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
                                "h-11 min-h-[44px] flex-1 px-2.5 sm:px-3 text-xs sm:text-sm transition-all rounded-lg",
                                isActive
                                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                  : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
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
                      <Label className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.participants}</span>
                        <ReqStar />
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          placeholder={t.customValue}
                          disabled={selectedSlotKeys.size === 0}
                          value={currentPanelSettings?.customParticipants || ""}
                          className={cn(
                            "h-11 min-h-[44px] text-xs sm:text-sm font-semibold w-28 sm:w-36 flex-shrink-0 text-center rounded-lg border border-input bg-background outline-none transition-colors",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            "focus:border-primary focus:ring-2 focus:ring-primary/20",
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
                                "h-11 min-h-[44px] flex-1 px-1.5 sm:px-2 text-xs sm:text-sm transition-all rounded-lg",
                                isActive
                                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                  : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
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
                        className="w-full justify-between h-11 min-h-[44px] px-3.5 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all rounded-lg"
                      >
                        <span className="text-xs sm:text-sm font-semibold text-foreground">
                          {t.details}
                        </span>
                        <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Button>
                    </div>
                  </div>

                  {/* Title above Repeat Schedule */}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-base sm:text-[17px] font-medium text-foreground whitespace-pre-line leading-snug">
                      {t.repeatScheduleTitle}
                    </p>
                  </div>

                  {/* Separate Repetition Card under Settings Card */}
                  <div className="p-4 sm:p-4.5 rounded-2xl border border-border bg-card shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="repeat-switch" className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.everyWeek}</span>
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
                                      : "bg-background text-muted-foreground border border-border/80 hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
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
                            {(["1week", "1month", "2months", "custom"] as const).map((period) => (
                              <Button
                                key={period}
                                type="button"
                                variant={repeatPeriod === period ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  setRepeatPeriod(period);
                                  if (period === "custom") {
                                    if (repeatUntil) {
                                      const parts = repeatUntil.split("-");
                                      if (parts.length === 3) {
                                        setRepeatYear(parts[0]);
                                        setRepeatMonth(parts[1]);
                                        setRepeatDay(parts[2]);
                                      }
                                    } else {
                                      setRepeatYear("");
                                      setRepeatMonth("");
                                      setRepeatDay("");
                                    }
                                    setIsCustomRepeatDialogOpen(true);
                                  }
                                }}
                                className={cn(
                                  "h-11 min-h-[44px] text-xs sm:text-sm font-semibold rounded-lg transition-all",
                                  repeatPeriod === period
                                    ? "bg-primary text-primary-foreground font-semibold"
                                    : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                                )}
                              >
                                {period === "1week"
                                  ? t.oneWeek
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
                          <div className="pt-0.5">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (repeatUntil) {
                                  const parts = repeatUntil.split("-");
                                  if (parts.length === 3) {
                                    setRepeatYear(parts[0]);
                                    setRepeatMonth(parts[1]);
                                    setRepeatDay(parts[2]);
                                  }
                                } else {
                                  setRepeatYear("");
                                  setRepeatMonth("");
                                  setRepeatDay("");
                                }
                                setIsCustomRepeatDialogOpen(true);
                              }}
                              className="w-full justify-between h-11 min-h-[44px] px-3.5 border-primary/40 bg-background text-xs sm:text-sm font-medium hover:bg-primary/10 transition-all rounded-lg"
                            >
                              <span className="truncate font-semibold text-foreground">
                                {repeatUntil
                                  ? `${language === "ru" ? "До: " : "Дейін: "}${format(parseISO(repeatUntil), "d MMMM yyyy", { locale: language === "ru" ? ru : kk })}`
                                  : (language === "ru" ? "Выберите дату окончания" : "Аяқталу күнін таңдаңыз")}
                              </span>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            </Button>
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

        {/* Custom Repeat Date Dialog (Modal with calendar, segmented inputs, no bottom buttons) */}
        <Dialog open={isCustomRepeatDialogOpen} onOpenChange={setIsCustomRepeatDialogOpen}>
          <DialogContent hideCloseButton className="max-w-sm sm:max-w-md w-full p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-1 border-b border-border/50">
              <DialogTitle className="text-base sm:text-lg font-semibold text-foreground">
                {language === "ru" ? "Повторять до даты" : "Күнге дейін қайталау"}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 min-h-0 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => setIsCustomRepeatDialogOpen(false)}
                title={t.cancel}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Segmented Date Input: [ Day ] . [ Month ] . [ Year ] */}
            <div className="flex items-end justify-center gap-1.5 py-1">
              <div className="w-20">
                <Input
                  ref={dayInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder={language === "ru" ? "День" : "Күн"}
                  maxLength={2}
                  value={repeatDay}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setRepeatDay(val);
                    if (val.length === 2) {
                      monthInputRef.current?.focus();
                      monthInputRef.current?.select();
                    }
                    updateRepeatUntilFromParts(val, repeatMonth, repeatYear);
                  }}
                  className="h-11 text-center font-semibold text-sm sm:text-base rounded-xl border-border bg-background focus:border-primary placeholder:text-muted-foreground/70"
                />
              </div>
              <span className="text-muted-foreground font-bold text-2xl select-none pb-1.5 leading-none">.</span>
              <div className="w-24">
                <Input
                  ref={monthInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder={language === "ru" ? "Месяц" : "Ай"}
                  maxLength={2}
                  value={repeatMonth}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setRepeatMonth(val);
                    if (val.length === 2) {
                      yearInputRef.current?.focus();
                      yearInputRef.current?.select();
                    }
                    updateRepeatUntilFromParts(repeatDay, val, repeatYear);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !repeatMonth) {
                      dayInputRef.current?.focus();
                    }
                  }}
                  className="h-11 text-center font-semibold text-sm sm:text-base rounded-xl border-border bg-background focus:border-primary placeholder:text-muted-foreground/70"
                />
              </div>
              <span className="text-muted-foreground font-bold text-2xl select-none pb-1.5 leading-none">.</span>
              <div className="w-20">
                <Input
                  ref={yearInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder={language === "ru" ? "Год" : "Жыл"}
                  maxLength={4}
                  value={repeatYear}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setRepeatYear(val);
                    updateRepeatUntilFromParts(repeatDay, repeatMonth, val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !repeatYear) {
                      monthInputRef.current?.focus();
                    }
                  }}
                  className="h-11 text-center font-semibold text-sm sm:text-base rounded-xl border-border bg-background focus:border-primary placeholder:text-muted-foreground/70"
                />
              </div>
            </div>

            {/* Calendar picker with circular highlighted dates and disabled past arrow */}
            <div className="flex justify-center border border-border/70 rounded-xl p-2 bg-muted/20">
              <Calendar
                mode="single"
                selected={repeatUntil ? parseISO(repeatUntil) : undefined}
                onSelect={(date) => {
                  if (date && !isPastOrToday(date)) {
                    const isoStr = format(date, "yyyy-MM-dd");
                    setRepeatUntil(isoStr);
                    setRepeatDay(format(date, "dd"));
                    setRepeatMonth(format(date, "MM"));
                    setRepeatYear(format(date, "yyyy"));
                  }
                }}
                fromMonth={new Date()}
                disabled={isPastOrToday}
                locale={language === "ru" ? ru : kk}
                initialFocus
                classNames={{
                  cell: "h-9 w-9 text-center text-sm p-0 relative flex items-center justify-center bg-transparent",
                  day: "h-8 w-8 p-0 font-medium rounded-full flex items-center justify-center transition-colors hover:bg-primary/15 hover:text-primary",
                  day_selected: "!bg-primary !text-primary-foreground font-bold hover:!bg-primary hover:!text-primary-foreground !rounded-full shadow-sm focus:!bg-primary focus:!text-primary-foreground",
                  day_today: "text-muted-foreground font-semibold rounded-full border border-muted-foreground/30",
                  day_outside: "text-muted-foreground opacity-50",
                  day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed pointer-events-none",
                  nav_button: "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors",
                  nav_button_previous: "absolute left-1 disabled:invisible",
                  nav_button_next: "absolute right-1",
                }}
              />
            </div>
          </DialogContent>
        </Dialog>

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
