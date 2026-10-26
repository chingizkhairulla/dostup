import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, ChevronDown, ChevronUp, Settings, ChevronLeft, ChevronRight, Trash2, Check, MapPin, Plus, X, Pencil, Calendar as CalendarIcon, Timer, Users, Package, Video, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { format, addDays, startOfWeek, isSameDay, parseISO, isValid, differenceInCalendarWeeks } from "date-fns";
import { ru, kk } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import CoverCropEditor from "@/components/creator/CoverCropEditor";
import { useCoverCrop } from "@/hooks/useCoverCrop";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import ProductSwitcher from "@/components/creator/ProductSwitcher";
import { invokeApi, sessionCreds } from "@/lib/sessionApi";
import { splitIntoLessons } from "@/lib/timeSlots";

interface SlotSettings {
  slotDuration?: number;
  customDuration?: string;
  maxParticipants?: number;
  customParticipants?: string;
  productId?: string;
  title: string;
  description: string;
  imageUrl: string;
  location: string;
  repeatWeekly?: boolean;
  repeatPeriod?: "1week" | "2weeks" | "1month" | "custom" | null;
  repeatUntil?: string | null;
  conferenceType?: "google_meet" | "custom" | null;
  googleMeetLink?: string;
  customConferenceLink?: string;
}

export interface SlotCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: "ru" | "kk";
  existingSlots?: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    product_id?: string;
    lesson_link?: string | null;
  }[];
  initialWeekStart?: Date;
  products?: { id: string; title: string }[];
  defaultProductId?: string | null;
  onCreateSlots: (params: {
    startDate?: string;
    daySlots?: Record<
      number,
      {
        start: string;
        end: string;
        slotDuration?: number;
        maxParticipants?: number;
        productId?: string;
        title?: string;
        description?: string;
        imageUrl?: string;
        location?: string;
        repeatWeekly?: boolean;
        repeatPeriod?: "1week" | "2weeks" | "1month" | "custom" | null;
        repeatUntil?: string | null;
        lessonLink?: string;
      }[]
    >;
    timeIntervals: { start: string; end: string }[];
    repeatDays: number[];
    repeatWeekly: boolean;
    repeatPeriod: "1week" | "2weeks" | "1month" | "custom" | null;
    repeatUntil: string | null;
    slotDuration: number;
    maxParticipants: number;
    productId?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    location?: string;
    lessonLink?: string;
    deletedSlotIds?: string[];
  }) => void;
  onDeleteSlots?: (dates: string[]) => Promise<void> | void;
  isPending?: boolean;
}

// Helper to add or subtract minutes from HH:MM
const addMinutesToTime = (timeStr: string, minutesToAdd: number) => {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  let totalM = h * 60 + m + minutesToAdd;
  if (totalM < 0) totalM += 24 * 60;
  totalM = totalM % (24 * 60);
  const newH = Math.floor(totalM / 60);
  const newM = totalM % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
};

// Helper to get minutes from wizard day start (09:00 AM)
const getMinutesFromDayStart = (timeStr: string, startHour: number = 9) => {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  let diffHours = h - startHour;
  if (diffHours < 0) diffHours += 24;
  return diffHours * 60 + m;
};

// Center the selected item inside a scrollable picker column
const centerSelectedIn = (container: HTMLElement | null) => {
  if (!container) return;
  const el = container.querySelector<HTMLElement>('[data-selected="true"]');
  if (!el) return;
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  container.scrollTop += eRect.top - cRect.top - container.clientHeight / 2 + eRect.height / 2;
};

// Radix scroll area with a permanently visible scrollbar at a fixed position (no overlay-scrollbar jump)
const AlwaysScrollArea = ({ className, viewportClassName, children }: { className?: string; viewportClassName?: string; children: React.ReactNode }) => (
  <ScrollAreaPrimitive.Root type="always" className={cn("relative overflow-hidden", className)}>
    <ScrollAreaPrimitive.Viewport className={cn("h-full w-full rounded-[inherit] overscroll-contain", viewportClassName)}>
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex touch-none select-none w-1.5 p-0 my-1 mr-0.5 rounded-full bg-muted/30">
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-muted-foreground/35" />
    </ScrollAreaPrimitive.Scrollbar>
  </ScrollAreaPrimitive.Root>
);

// Editable time popover picker: no keyboard input into numbers, only free hours from 09:00 to 01:00, no past time, minTime for end box
function EditableTime({
  time,
  onChange,
  availableHours,
  minTime,
  isTimeInPast,
  language = "ru",
}: {
  time: string;
  onChange: (t: string, isSilent?: boolean) => boolean | void;
  availableHours?: string[];
  minTime?: string;
  isTimeInPast?: (timeStr: string) => boolean;
  language?: "ru" | "kk";
}) {
  const [hProp, mProp] = (time || "00:00").split(":");
  const [hVal, setHVal] = useState(hProp || "00");
  const [mVal, setMVal] = useState(mProp || "00");
  const [isOpen, setIsOpen] = useState(false);

  const hoursContainerRef = useRef<HTMLDivElement>(null);
  const minutesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let effectiveTime = time || "00:00";
    if (minTime && getMinutesFromDayStart(effectiveTime) < getMinutesFromDayStart(minTime)) {
      effectiveTime = minTime;
    }
    const [h, m] = effectiveTime.split(":");
    setHVal(h || "00");
    setMVal(m || "00");
  }, [time, minTime]);

  // Center selected hour/minute once the popover content is laid out (rAF + after open animation)
  useEffect(() => {
    if (!isOpen) return;
    const center = () => {
      centerSelectedIn(hoursContainerRef.current);
      centerSelectedIn(minutesContainerRef.current);
    };
    const raf = requestAnimationFrame(center);
    const timer = setTimeout(center, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isOpen]);

  const commit = (newH: string, newM: string): boolean => {
    const fullTime = `${newH}:${newM}`;
    const ok = onChange(fullTime);
    if (ok === false) {
      setHVal(hProp || "00");
      setMVal(mProp || "00");
      return false;
    }
    return true;
  };

  const ALLOWED_HOURS = [
    "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "00", "01"
  ];

  const hoursList = useMemo(() => {
    let base = availableHours && availableHours.length > 0 ? [...availableHours] : [...ALLOWED_HOURS];

    // Filter out past hours entirely so users don't see or click them
    if (isTimeInPast) {
      base = base.filter((h) => !isTimeInPast(`${h}:55`));
    }

    // Filter out hours earlier than minTime (e.g. for end time box)
    if (minTime) {
      base = base.filter((h) => getMinutesFromDayStart(`${h}:55`) >= getMinutesFromDayStart(minTime));
    }

    // Preserve the strict 09..01 chronological order requested by user
    base.sort((a, b) => {
      const idxA = ALLOWED_HOURS.indexOf(a);
      const idxB = ALLOWED_HOURS.indexOf(b);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });

    return base;
  }, [availableHours, isTimeInPast, minTime]);

  const minutesList = useMemo(() => {
    const standard = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
    let filtered = standard;

    // Filter out minutes that are in the past for currently selected hour hVal
    if (isTimeInPast) {
      filtered = filtered.filter((minStr) => !isTimeInPast(`${hVal}:${minStr}`));
    }

    // Filter out minutes earlier than minTime for currently selected hour hVal
    if (minTime) {
      filtered = filtered.filter((minStr) => getMinutesFromDayStart(`${hVal}:${minStr}`) >= getMinutesFromDayStart(minTime));
    }

    return filtered;
  }, [hVal, isTimeInPast, minTime]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center h-6.5 sm:h-7 w-[58px] sm:w-[62px] bg-background/90 hover:bg-background border border-border/80 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20 rounded-md px-1 font-mono text-[13px] sm:text-sm font-semibold text-foreground transition-colors cursor-pointer select-none",
            isOpen && "border-primary ring-1 ring-primary/30 bg-background"
          )}
          title={language === "ru" ? "Нажмите, чтобы выбрать время" : "Уақытты таңдау үшін басыңыз"}
        >
          <span>{hVal}</span>
          <span className="text-foreground/70 select-none font-bold text-xs sm:text-sm leading-none mx-0.5">
            :
          </span>
          <span>{mVal}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={6}
        className="w-52 p-2.5 bg-card border border-border rounded-xl shadow-xl z-50 select-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="grid grid-cols-2 gap-3 pb-1.5 mb-1.5 border-b border-border/50 text-[11px] font-semibold text-muted-foreground px-1">
          <span className="text-left">{language === "ru" ? "Часы" : "Сағат"}</span>
          <span className="text-left">{language === "ru" ? "Минуты" : "Минут"}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 h-48 py-0.5">
          {/* Hours Column */}
          <div
            ref={hoursContainerRef}
            onWheel={(e) => e.stopPropagation()}
            className="overflow-y-auto overscroll-contain touch-pan-y space-y-1 text-center pr-3 max-h-48 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent"
          >
            {hoursList.map((hourStr) => {
              const isSelected = hourStr === hVal;
              return (
                <button
                  key={hourStr}
                  type="button"
                  data-selected={isSelected ? "true" : "false"}
                  onClick={() => {
                    setHVal(hourStr);
                    let nextM = mVal;
                    const isMinInvalid = (m: string) => {
                      if (isTimeInPast && isTimeInPast(`${hourStr}:${m}`)) return true;
                      if (minTime && getMinutesFromDayStart(`${hourStr}:${m}`) < getMinutesFromDayStart(minTime)) return true;
                      return false;
                    };
                    if (isMinInvalid(mVal)) {
                      const validM = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].find(
                        (m) => !isMinInvalid(m)
                      );
                      if (validM) {
                        nextM = validM;
                        setMVal(validM);
                      }
                    }
                    commit(hourStr, nextM);
                  }}
                  className={cn(
                    "w-full h-7 sm:h-8 flex items-center justify-center text-xs sm:text-sm font-mono rounded-lg transition-colors cursor-pointer",
                    isSelected
                      ? "bg-primary text-primary-foreground font-bold shadow-xs"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  {hourStr}
                </button>
              );
            })}
          </div>

          {/* Minutes Column */}
          <div
            ref={minutesContainerRef}
            onWheel={(e) => e.stopPropagation()}
            className="overflow-y-auto overscroll-contain touch-pan-y space-y-1 text-center pr-3 max-h-48 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent"
          >
            {minutesList.map((minStr) => {
              const isSelected = minStr === mVal;
              return (
                <button
                  key={minStr}
                  type="button"
                  data-selected={isSelected ? "true" : "false"}
                  onClick={() => {
                    setMVal(minStr);
                    commit(hVal, minStr);
                  }}
                  className={cn(
                    "w-full h-7 sm:h-8 flex items-center justify-center text-xs sm:text-sm font-mono rounded-lg transition-colors cursor-pointer",
                    isSelected
                      ? "bg-primary text-primary-foreground font-bold shadow-xs"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  {minStr}
                </button>
              );
            })}
          </div>
        </div>
        <div className="pt-2 border-t border-border/50 mt-1 flex justify-end">
          <button
            type="button"
            className="h-7 px-3 text-xs font-semibold text-muted-foreground hover:text-white hover:bg-primary rounded-lg transition-colors cursor-pointer"
            onClick={() => setIsOpen(false)}
          >
            {language === "ru" ? "Готово" : "Дайын"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeRangePickerContent({
  tempWorkingHours,
  setTempWorkingHours,
  onApply,
  t,
  language,
}: {
  tempWorkingHours: { start: string; end: string };
  setTempWorkingHours: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
  onApply: () => void;
  t: any;
  language: "ru" | "kk";
}) {
  const [activeField, setActiveField] = useState<"start" | "end">("start");
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);

  const ALLOWED_HOURS = [
    "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "00", "01"
  ];
  const MINUTES = [
    "00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"
  ];

  const curTime = activeField === "start" ? tempWorkingHours.start : tempWorkingHours.end;
  const [curH, curM] = (curTime || "09:00").split(":");

  // Center selected hour/minute on mount and whenever the active field changes
  useEffect(() => {
    const center = () => {
      centerSelectedIn(hoursRef.current);
      centerSelectedIn(minutesRef.current);
    };
    const raf = requestAnimationFrame(center);
    const timer = setTimeout(center, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [activeField]);

  return (
    <div className="space-y-2.5">
      <div className="pb-1 border-b border-border/50">
        <h4 className="text-xs font-semibold text-foreground">{t.timeRangeTitle}</h4>
      </div>

      {/* Start / End toggle pills */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveField("start")}
          className={cn(
            "flex flex-col items-center justify-center py-1.5 px-2 rounded-xl border text-xs font-mono transition-all cursor-pointer",
            activeField === "start"
              ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary/40"
              : "border-border/80 bg-muted/40 hover:bg-muted text-foreground"
          )}
        >
          <span className="text-[10px] font-sans font-medium text-muted-foreground uppercase">{t.start}</span>
          <span className="text-sm font-semibold">{tempWorkingHours.start}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveField("end")}
          className={cn(
            "flex flex-col items-center justify-center py-1.5 px-2 rounded-xl border text-xs font-mono transition-all cursor-pointer",
            activeField === "end"
              ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary/40"
              : "border-border/80 bg-muted/40 hover:bg-muted text-foreground"
          )}
        >
          <span className="text-[10px] font-sans font-medium text-muted-foreground uppercase">{t.end}</span>
          <span className="text-sm font-semibold">{tempWorkingHours.end}</span>
        </button>
      </div>

      {/* Hours & Minutes Header */}
      <div className="grid grid-cols-2 gap-2 pb-1 border-b border-border/50 text-[11px] font-semibold text-muted-foreground px-1">
        <span className="text-left">{language === "ru" ? "Часы" : "Сағат"}</span>
        <span className="text-left">{language === "ru" ? "Минуты" : "Минут"}</span>
      </div>

      {/* Hours & Minutes Scroll Columns */}
      <div className="grid grid-cols-2 gap-2 h-44 py-0.5">
        {/* Hours Column */}
        <div
          ref={hoursRef}
          onWheel={(e) => e.stopPropagation()}
          className="overflow-y-auto overscroll-contain touch-pan-y space-y-1 text-center pr-2 max-h-44 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent"
        >
          {ALLOWED_HOURS.map((hourStr) => {
            const isSelected = hourStr === curH;
            return (
              <button
                key={hourStr}
                type="button"
                data-selected={isSelected ? "true" : "false"}
                onClick={() => {
                  const newTime = `${hourStr}:${curM || "00"}`;
                  if (activeField === "start") {
                    setTempWorkingHours((prev) => ({ ...prev, start: newTime }));
                  } else {
                    setTempWorkingHours((prev) => ({ ...prev, end: newTime }));
                  }
                }}
                className={cn(
                  "w-full h-7 flex items-center justify-center text-xs font-mono rounded-lg transition-colors cursor-pointer",
                  isSelected
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "hover:bg-muted text-foreground"
                )}
              >
                {hourStr}
              </button>
            );
          })}
        </div>

        {/* Minutes Column */}
        <div
          ref={minutesRef}
          onWheel={(e) => e.stopPropagation()}
          className="overflow-y-auto overscroll-contain touch-pan-y space-y-1 text-center pr-2 max-h-44 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent"
        >
          {MINUTES.map((minStr) => {
            const isSelected = minStr === curM;
            return (
              <button
                key={minStr}
                type="button"
                data-selected={isSelected ? "true" : "false"}
                onClick={() => {
                  const newTime = `${curH || "09"}:${minStr}`;
                  if (activeField === "start") {
                    setTempWorkingHours((prev) => ({ ...prev, start: newTime }));
                  } else {
                    setTempWorkingHours((prev) => ({ ...prev, end: newTime }));
                  }
                }}
                className={cn(
                  "w-full h-7 flex items-center justify-center text-xs font-mono rounded-lg transition-colors cursor-pointer",
                  isSelected
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "hover:bg-muted text-foreground"
                )}
              >
                {minStr}
              </button>
            );
          })}
        </div>
      </div>

      {/* Apply button */}
      <div className="pt-2 border-t border-border/50">
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs font-semibold cursor-pointer bg-card text-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40"
          onClick={onApply}
        >
          {t.apply}
        </Button>
      </div>
    </div>
  );
}

export default function SlotCreationWizard({
  open,
  onOpenChange,
  language,
  existingSlots,
  initialWeekStart,
  products = [],
  defaultProductId,
  onCreateSlots,
  onDeleteSlots,
  isPending,
}: SlotCreationWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showLateHours, setShowLateHours] = useState(false);
  const [workingHours, setWorkingHours] = useState(() => {
    const isMob = typeof window !== "undefined" && window.innerWidth < 640;
    return { start: "09:00", end: isMob ? "19:00" : "21:00" };
  });
  const [tempWorkingHours, setTempWorkingHours] = useState(() => {
    const isMob = typeof window !== "undefined" && window.innerWidth < 640;
    return { start: "09:00", end: isMob ? "19:00" : "21:00" };
  });
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [isMobileRangeOpen, setIsMobileRangeOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isMobileConfirmClearOpen, setIsMobileConfirmClearOpen] = useState(false);

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
  // Phone bottom panels ("Выбранное время" on step 1, "Параметры" on step 2), opened with the arrow
  const [isMobileTimesExpanded, setIsMobileTimesExpanded] = useState(false);
  const [isMobileParamsExpanded, setIsMobileParamsExpanded] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<1 | 2 | null>(null);
  const [pressedToolbarBtn, setPressedToolbarBtn] = useState<"selectAll" | "unselectAll" | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Step 2: Global repetition settings (default: off)
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([0, 1, 2, 3, 4]); // Mon-Fri
  const [repeatPeriod, setRepeatPeriod] = useState<"1week" | "2weeks" | "1month" | "custom" | null>("1week");
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

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  const isMobile = useIsMobile();
  const [mobileDayIdx, setMobileDayIdx] = useState<number>(() => {
    const dow = (new Date().getDay() + 6) % 7;
    return dow >= 0 && dow < 7 ? dow : 0;
  });

  useEffect(() => {
    if (isMobile && (workingHours.end === "21:00" || workingHours.end === "18:00") && !showLateHours) {
      setWorkingHours({ start: "09:00", end: "19:00" });
      setTempWorkingHours({ start: "09:00", end: "19:00" });
    }
  }, [isMobile]);

  const isTouchDraggingRef = useRef(false);
  const touchDragModeRef = useRef<"select" | "deselect">("select");
  const lastTouchCellIdRef = useRef<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number>(0);

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [cellsByWeek, setCellsByWeek] = useState<Record<number, Set<string>>>({});

  const realCurrentWeekStart = useMemo(() => {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  }, []);

  const weekDates = useMemo(() => {
    const targetStart = addDays(realCurrentWeekStart, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(targetStart, i));
  }, [realCurrentWeekStart, weekOffset]);

  const isCellInPast = useCallback(
    (dayIdx: number, timeStr: string) => {
      const date = weekDates[dayIdx];
      if (!date) return false;
      const [h, m] = timeStr.split(":").map(Number);
      const startHour = parseInt(workingHours.start.split(":")[0], 10) || 9;

      const cellDate = new Date(date);
      // Late night hours (00:00, 00:30, 01:00) come after 23:00 of this column's day
      if (h < startHour) {
        cellDate.setDate(cellDate.getDate() + 1);
      }
      cellDate.setHours(h, m, 0, 0);

      return cellDate.getTime() < Date.now();
    },
    [weekDates, workingHours.start]
  );

  const isIntervalUnderGrid = useCallback(
    (dayIdx: number, interval: { start: string; end: string }) => {
      const [sh, sm] = interval.start.split(":").map(Number);
      const [eh, em] = interval.end.split(":").map(Number);
      let curM = sh * 60 + sm;
      let endM = eh * 60 + em;
      if (endM <= curM) endM += 24 * 60;

      for (let m = curM; m < endM; m += 30) {
        const ch = Math.floor(m / 60) % 24;
        const cm = m % 60;
        const cellTimeStr = `${String(ch).padStart(2, "0")}:${String(cm).padStart(2, "0")}`;
        if (isCellInPast(dayIdx, cellTimeStr)) {
          return true;
        }
      }
      return false;
    },
    [isCellInPast]
  );

  const getInitialCellsForDates = useCallback(
    (dates: Date[]) => {
      const cells = new Set<string>();
      const startHour = parseInt(workingHours.start.split(":")[0], 10) || 9;

      if (existingSlots && existingSlots.length > 0) {
        dates.forEach((date, dayIdx) => {
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
              cells.add(cellId);
            }
          });
        });
      }
      return cells;
    },
    [existingSlots, workingHours.start]
  );

  const changeWeek = (newOffset: number) => {
    if (newOffset < 0) return;
    setCellsByWeek((prev) => ({
      ...prev,
      [weekOffset]: new Set(selectedCells),
    }));

    const targetStart = addDays(realCurrentWeekStart, newOffset * 7);
    const targetDates = Array.from({ length: 7 }, (_, i) => addDays(targetStart, i));

    setCellsByWeek((prev) => {
      const existingForTarget = prev[newOffset];
      if (existingForTarget) {
        setSelectedCells(new Set(existingForTarget));
      } else {
        const loaded = getInitialCellsForDates(targetDates);
        setSelectedCells(loaded);
      }
      return prev;
    });

    setWeekOffset(newOffset);
  };

  const existingSlotKeysSet = useMemo(() => {
    const set = new Set<string>();
    if (existingSlots && existingSlots.length > 0) {
      weekDates.forEach((date, dayIdx) => {
        const dateStr = format(date, "yyyy-MM-dd");
        const dayExisting = existingSlots.filter((s) => s.date === dateStr);
        dayExisting.forEach((s) => {
          const sStart = s.start_time.slice(0, 5);
          const sEnd = s.end_time.slice(0, 5);
          set.add(`${dayIdx}_${sStart}_${sEnd}`);
        });
      });
    }
    return set;
  }, [existingSlots, weekDates]);

  const handleSaveCrop = async () => {
    if (!coverCrop.source || cropSaving) return;
    setCropSaving(true);
    try {
      const result = await coverCrop.getCroppedImage();
      if (!result) return;
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
      const initialOffset = initialWeekStart
        ? Math.max(0, differenceInCalendarWeeks(initialWeekStart, realCurrentWeekStart, { weekStartsOn: 1 }))
        : 0;
      setWeekOffset(initialOffset);
      setCellsByWeek({});
      const initialDates = Array.from({ length: 7 }, (_, i) =>
        addDays(realCurrentWeekStart, initialOffset * 7 + i)
      );
      const initialCells = getInitialCellsForDates(initialDates);

      setSelectedCells(initialCells);
      setCustomDayIntervals({});
      setSlotSettingsMap({});
      setSelectedSlotKeys(new Set());
      setIsMouseDown(false);
      setShowLateHours(false);
      const isMob = (typeof window !== "undefined" && window.innerWidth < 640) || isMobile;
      const defaultEnd = isMob ? "19:00" : "21:00";
      setWorkingHours({ start: "09:00", end: defaultEnd });
      setTempWorkingHours({ start: "09:00", end: defaultEnd });
      setIsRangeOpen(false);
      setIsMobileRangeOpen(false);
      setIsConfirmClearOpen(false);
      setIsMobileConfirmClearOpen(false);
      setRepeatWeekly(false);
      setRepeatPeriod("1week");
      setRepeatUntil("");
      setIsCustomRepeatDialogOpen(false);
      setRepeatDay("");
      setRepeatMonth("");
      setRepeatYear("");
      setIsDetailsDialogOpen(false);
      setIsMobileTimesExpanded(false);
      setIsMobileParamsExpanded(false);
      coverCrop.resetCrop();
    }
  }, [open, existingSlots, realCurrentWeekStart, initialWeekStart, getInitialCellsForDates]);

  useEffect(() => {
    const up = () => setIsMouseDown(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const dict = {
    ru: {
      wizTitleStep1: "Создание и удаление слотов",
      wizTitleStep2: "Настройка параметров",
      step1: "Слоты",
      step2: "Параметры",
      showLateHours: "Показать поздние часы",
      hideLateHours: "Скрыть поздние часы",
      timeRangeBtn: "Диапазон часов",
      timeRangeTitle: "Время слева будет показываться:",
      timezone: "Часовой пояс",
      start: "С",
      end: "По",
      apply: "Применить",
      weekDays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
      weekDaysFull: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
      oneWeek: "1 неделя",
      oneMonth: "1 месяц",
      twoWeeks: "2 недели",
      custom: "Свой",
      customValue: "Своё",
      everyWeek: "Повторять уроки",
      repeatScheduleTitle: "Расписание",
      slotParams: "Слоты",
      repeatPeriodLabel: "Срок повторения:",
      repeatDaysLabel: "Дни для повторения:",
      repeatUntilLabel: "Повторять до даты:",
      lessonDuration: "Длительность урока",
      min: "мин",
      participants: "Количество участников",
      details: "Детали урока",
      detailsHint: "Название, описание, обложка…",
      noSlotsForDay: "В этот день нет слотов",
      cover: "Обложка",
      titleLabel: "Название",
      description: "Описание",
      location: "Местоположение",
      ready: "Готово",
      clearAll: "Удалить все слоты",
      confirmClearRemainingTitle: "Точно удалить оставшиеся слоты на неделю?",
      confirmClearAllTitle: "Точно удалить все слоты на неделю?",
      cancel: "Отмена",
      confirm: "Удалить",
      yes: "Да",
      no: "Нет",
      noSlotsWarning: "Выберите хотя бы одну клетку",
      repeatSummary: "Выбранное время",
      selectAll: "Выбрать все",
      unselectAll: "Снять выбор",
      different: "Разные",
      forProduct: "Относится к продукту",
      conferenceLink: "Ссылка на конференцию",
      conferenceLinkPlaceholder: "Zoom, Google Meet, Яндекс Телемост…",
    },
    kk: {
      wizTitleStep1: "Слоттарды жасау және жою",
      wizTitleStep2: "Параметрлерді баптау",
      step1: "Слоттар",
      step2: "Параметрлер",
      showLateHours: "Кешкі сағаттарды көрсету",
      hideLateHours: "Кешкі сағаттарды жасыру",
      timeRangeBtn: "Сағат аралығы",
      timeRangeTitle: "Сол жақтағы уақыт көрсетіледі:",
      timezone: "Уақыт белдеуі",
      start: "Басталуы",
      end: "Аяқталуы",
      apply: "Қолдану",
      weekDays: ["Дс", "Сс", "Ср", "Бс", "Жм", "Сн", "Жс"],
      weekDaysFull: ["Дүйсенбі", "Сейсенбі", "Сәрсенбі", "Бейсенбі", "Жұма", "Сенбі", "Жексенбі"],
      oneWeek: "1 апта",
      oneMonth: "1 ай",
      twoWeeks: "2 апта",
      custom: "Өзгерту",
      customValue: "Өзім",
      everyWeek: "Сабақтарды қайталау",
      forProduct: "Өнімге қатысты",
      repeatScheduleTitle: "Кесте",
      slotParams: "Слоттар",
      repeatPeriodLabel: "Қайталау мерзімі:",
      repeatDaysLabel: "Қайталанатын күндер:",
      repeatUntilLabel: "Күнге дейін қайталау:",
      lessonDuration: "Сабақ ұзақтығы",
      min: "мин",
      participants: "Қатысушылар саны",
      details: "Сабақ мәліметтері",
      detailsHint: "Атауы, сипаттамасы, мұқабасы…",
      noSlotsForDay: "Бұл күні слоттар жоқ",
      cover: "Мұқаба",
      titleLabel: "Атауы",
      description: "Сипаттамасы",
      location: "Орналасу жері",
      ready: "Дайын",
      clearAll: "Барлық слоттарды жою",
      confirmClearRemainingTitle: "Осы аптадағы қалған слоттарды жою керек пе?",
      confirmClearAllTitle: "Осы аптадағы барлық слоттарды жою керек пе?",
      cancel: "Болдырмау",
      confirm: "Жою",
      yes: "Иә",
      no: "Жоқ",
      noSlotsWarning: "Кем дегенде бір ұяшықты таңдаңыз",
      repeatSummary: "Таңдалған уақыт",
      selectAll: "Барлығын таңдау",
      unselectAll: "Таңдауды алып тастау",
      different: "Әртүрлі",
      conferenceLink: "Конференцияға сілтеме",
      conferenceLinkPlaceholder: "Zoom, Google Meet, Яндекс Телемост…",
    },
  };
  const t = dict[language];

  // Compute base hours between start and end
  const baseHours = useMemo(() => {
    const s = parseInt(workingHours.start.split(":")[0], 10) || 9;
    const e = parseInt(workingHours.end.split(":")[0], 10) || 21;
    const endMinutes = parseInt(workingHours.end.split(":")[1], 10) || 0;

    if (s === e && endMinutes === 0) return [s];

    const hours: number[] = [];
    let cur = s;
    const targetEnd = endMinutes > 0 ? (e + 1) % 24 : e;
    while (cur !== targetEnd) {
      hours.push(cur);
      cur = (cur + 1) % 24;
      if (hours.length >= 24) break;
    }
    return hours;
  }, [workingHours]);

  // Late hours: continuation from workingHours.end up to 01:00 AM without missing hours
  const lateHoursArr = useMemo(() => {
    const e = parseInt(workingHours.end.split(":")[0], 10) || 21;
    const endMinutes = parseInt(workingHours.end.split(":")[1], 10) || 0;
    const targetEnd = 1; // 01:00 AM
    if (e === targetEnd && endMinutes === 0) return [];

    const hours: number[] = [];
    let cur = e;
    while (cur !== targetEnd) {
      if (!hours.includes(cur)) {
        hours.push(cur);
      }
      cur = (cur + 1) % 24;
      if (hours.length >= 24) break;
    }
    return hours;
  }, [workingHours.end]);

  const displayHours = useMemo(() => {
    if (showLateHours && lateHoursArr.length > 0) {
      const merged = [...baseHours];
      lateHoursArr.forEach((h) => {
        if (!merged.includes(h)) merged.push(h);
      });
      return merged;
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
    const [dStr, tStr] = cellId.split("_");
    const dayIdx = Number(dStr);
    if (isCellInPast(dayIdx, tStr)) {
      toast.info(language === "ru" ? "Нельзя выбрать прошедшее время" : "Өткен уақытты таңдау мүмкін емес");
      return;
    }
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
    const [dStr, tStr] = cellId.split("_");
    const dayIdx = Number(dStr);
    if (isCellInPast(dayIdx, tStr)) {
      toast.info(language === "ru" ? "Нельзя выбрать прошедшее время" : "Өткен уақытты таңдау мүмкін емес");
      return;
    }
    setIsMouseDown(true);
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
    const [dStr, tStr] = cellId.split("_");
    const dayIdx = Number(dStr);
    if (isCellInPast(dayIdx, tStr)) return;

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
        .filter((timeStr) => !isCellInPast(day, timeStr))
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
  }, [selectedCells, isCellInPast]);

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

  const editableDaysOnDesktop = useMemo(() => {
    return activeDays.filter((dayIdx) => {
      const intervals = effectiveIntervalsByDay[dayIdx] || [];
      return intervals.some((interval) => !isIntervalUnderGrid(dayIdx, interval));
    });
  }, [activeDays, effectiveIntervalsByDay, isIntervalUnderGrid]);

  const currentDayEditableIntervals = useMemo(() => {
    return (effectiveIntervalsByDay[mobileDayIdx] || [])
      .map((interval, originalIdx) => ({ interval, originalIdx }))
      .filter(({ interval }) => !isIntervalUnderGrid(mobileDayIdx, interval));
  }, [effectiveIntervalsByDay, mobileDayIdx, isIntervalUnderGrid]);

  const mobileBottomBarRef = useRef<HTMLDivElement>(null);
  const [mobileBottomBarHeight, setMobileBottomBarHeight] = useState(140);

  useEffect(() => {
    const el = mobileBottomBarRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (mobileBottomBarRef.current) {
        const h = mobileBottomBarRef.current.offsetHeight;
        if (h > 0) {
          setMobileBottomBarHeight(h);
        }
      }
    };

    updateHeight();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateHeight();
      });
      ro.observe(el);
    }

    window.addEventListener("resize", updateHeight);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [step, currentDayEditableIntervals.length]);

  // All slot keys in Step 2: `${dateStr}_${start}_${end}`
  const allSlotKeys = useMemo(() => {
    const keys: string[] = [];
    editableDaysOnDesktop.forEach((dayIdx) => {
      const date = weekDates[dayIdx];
      if (!date) return;
      const dateStr = format(date, "yyyy-MM-dd");
      effectiveIntervalsByDay[dayIdx]?.forEach((interval) => {
        if (!isIntervalUnderGrid(dayIdx, interval)) {
          keys.push(`${dateStr}_${interval.start}_${interval.end}`);
        }
      });
    });
    return keys;
  }, [editableDaysOnDesktop, effectiveIntervalsByDay, weekDates, isIntervalUnderGrid]);

  // Default initial settings for when a slot is first clicked
  const createDefaultSlotSettings = (initialProductIdOrExisting?: string | { product_id?: string; lesson_link?: string | null }): SlotSettings => {
    const pId = typeof initialProductIdOrExisting === "object" ? initialProductIdOrExisting?.product_id : initialProductIdOrExisting;
    const link = typeof initialProductIdOrExisting === "object" ? initialProductIdOrExisting?.lesson_link || "" : "";
    return {
      slotDuration: 60,
      maxParticipants: 1,
      productId: pId || defaultProductId || products[0]?.id || "",
      title: "",
      description: "",
      imageUrl: "",
      location: "",
      repeatWeekly: false,
      repeatPeriod: "1week",
      repeatUntil: null,
      customConferenceLink: link,
    };
  };

  // When switching to step 2: auto-select new slots!
  const handleStepChange = (newStep: 1 | 2) => {
    // Re-entering the current step would reset the slot selection
    if (newStep === step) return;
    if (newStep === 2) {
      if (editableDaysOnDesktop.length === 0) return;
      setRepeatDays(editableDaysOnDesktop);

      const newKeys: string[] = [];
      const allKeys: string[] = [];
      editableDaysOnDesktop.forEach((dayIdx) => {
        const date = weekDates[dayIdx];
        if (!date) return;
        const dateStr = format(date, "yyyy-MM-dd");
        const intervals = effectiveIntervalsByDay[dayIdx] || [];
        intervals.forEach((interval) => {
          if (isIntervalUnderGrid(dayIdx, interval)) return;
          const key = `${dateStr}_${interval.start}_${interval.end}`;
          allKeys.push(key);
          if (!existingSlotKeysSet.has(`${dayIdx}_${interval.start}_${interval.end}`)) {
            newKeys.push(key);
          }
        });
      });

      const keysToSelect = newKeys.length > 0 ? newKeys : [];
      setSelectedSlotKeys(new Set(keysToSelect));
      setSlotSettingsMap((prev) => {
        const copy = { ...prev };
        keysToSelect.forEach((k) => {
          if (!copy[k]) {
            const [dStr, sTime] = k.split("_");
            const existing = existingSlots?.find(
              (es) => es.date === dStr && es.start_time.slice(0, 5) === sTime
            );
            copy[k] = createDefaultSlotSettings(existing);
          }
        });
        return copy;
      });
    }
    setStep(newStep);
  };

  // Helper to get 30-min grid cell IDs for an interval
  const getCellsForInterval = (dayIdx: number, start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let curM = sh * 60 + sm;
    let endM = eh * 60 + em;
    if (endM <= curM) endM += 24 * 60;

    const cells: string[] = [];
    const gridStartM = Math.floor(curM / 30) * 30;
    const gridEndM = Math.ceil(endM / 30) * 30;

    for (let m = gridStartM; m < gridEndM; m += 30) {
      const ch = Math.floor(m / 60) % 24;
      const cm = m % 60;
      cells.push(`${dayIdx}_${String(ch).padStart(2, "0")}:${String(cm).padStart(2, "0")}`);
    }
    return cells;
  };

  // Update interval time in Step 1
  const updateIntervalTime = (
    dayIdx: number,
    intervalIndex: number,
    newStart: string,
    newEnd: string,
    isSilent: boolean = false
  ) => {
    const startHour = parseInt(workingHours.start.split(":")[0], 10) || 9;
    const current = effectiveIntervalsByDay[dayIdx] || [];
    const oldInterval = current[intervalIndex];

    let finalStart = newStart;
    let finalEnd = newEnd;

    const oldStartM = oldInterval ? getMinutesFromDayStart(oldInterval.start, startHour) : 0;
    const oldEndM = oldInterval ? getMinutesFromDayStart(oldInterval.end, startHour) : 60;
    const oldDuration = Math.max(30, oldEndM - oldStartM);

    const isStartChanged = !oldInterval || newStart !== oldInterval.start;
    const isEndChanged = !oldInterval || newEnd !== oldInterval.end;

    if (isStartChanged) {
      if (isCellInPast(dayIdx, newStart)) {
        if (!isSilent) {
          toast.info(language === "ru" ? "Нельзя выбрать прошедшее время" : "Өткен уақытты таңдау мүмкін емес");
        }
        return false;
      }
      const curStartM = getMinutesFromDayStart(newStart, startHour);
      const curEndM = getMinutesFromDayStart(finalEnd, startHour);
      if (curEndM <= curStartM) {
        finalEnd = addMinutesToTime(newStart, oldDuration);
      }
    } else if (isEndChanged) {
      const curStartM = getMinutesFromDayStart(finalStart, startHour);
      const curEndM = getMinutesFromDayStart(newEnd, startHour);
      if (curEndM <= curStartM) {
        const candidateStart = addMinutesToTime(newEnd, -oldDuration);
        if (!isCellInPast(dayIdx, candidateStart) && getMinutesFromDayStart(candidateStart, startHour) < curEndM) {
          finalStart = candidateStart;
        } else {
          finalEnd = addMinutesToTime(finalStart, 30);
        }
      }
    }

    if (
      isCellInPast(dayIdx, finalStart) ||
      isCellInPast(dayIdx, finalEnd) ||
      isIntervalUnderGrid(dayIdx, { start: finalStart, end: finalEnd })
    ) {
      if (!isSilent) {
        toast.info(language === "ru" ? "Нельзя выбрать прошедшее время" : "Өткен уақытты таңдау мүмкін емес");
      }
      return false;
    }

    const updated = current.map((item, idx) => {
      if (idx === intervalIndex) {
        return { start: finalStart, end: finalEnd };
      }
      return item;
    });

    setCustomDayIntervals((prev) => ({
      ...prev,
      [dayIdx]: updated,
    }));

    // Update selectedCells on the fly so the Step 1 grid updates immediately!
    setSelectedCells((prev) => {
      const next = new Set<string>();
      // Preserve cells from other days and past cells on this day
      for (const cellId of prev) {
        const [dStr, tStr] = cellId.split("_");
        const d = Number(dStr);
        if (d !== dayIdx) {
          next.add(cellId);
        } else if (isCellInPast(d, tStr)) {
          next.add(cellId);
        }
      }

      // Add cells for all updated intervals on this day
      for (const intv of updated) {
        const cells = getCellsForInterval(dayIdx, intv.start, intv.end);
        for (const cellId of cells) {
          const tStr = cellId.split("_")[1];
          if (!isCellInPast(dayIdx, tStr)) {
            next.add(cellId);
          }
        }
      }
      return next;
    });
    return true;
  };

  // Compute available free hours for a specific day and interval (from 09:00 to 01:00)
  const getAvailableHoursForDay = useCallback(
    (
      dayIdx: number,
      currentTime: string,
      intervalIndex: number,
      isEnd: boolean,
      minTime?: string
    ) => {
      const otherIntervals = (effectiveIntervalsByDay[dayIdx] || []).filter((_, idx) => idx !== intervalIndex);

      const ALLOWED_HOURS = [
        "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "00", "01"
      ];

      const result: string[] = [];

      for (const hStr of ALLOWED_HOURS) {
        // Exclude if entirely in the past on this day
        if (isCellInPast(dayIdx, `${hStr}:55`)) {
          continue;
        }

        // Exclude if earlier than minTime (for interval end time box)
        if (minTime && getMinutesFromDayStart(`${hStr}:55`) < getMinutesFromDayStart(minTime)) {
          continue;
        }

        const h = parseInt(hStr, 10);

        // Check if point is occupied by other intervals
        const isPointOccupied = (minStr: string) => {
          const targetTotalM = (h < 9 ? h + 24 : h) * 60 + parseInt(minStr, 10);

          return otherIntervals.some((other) => {
            const [osh, osm] = other.start.split(":").map(Number);
            const [oeh, oem] = other.end.split(":").map(Number);
            const startM = (osh < 9 ? osh + 24 : osh) * 60 + osm;
            let endM = (oeh < 9 ? oeh + 24 : oeh) * 60 + oem;
            if (endM <= startM) endM += 24 * 60;

            if (isEnd) {
              return targetTotalM > startM && targetTotalM < endM;
            } else {
              return targetTotalM >= startM && targetTotalM < endM;
            }
          });
        };

        const point00Occupied = isPointOccupied("00") || isCellInPast(dayIdx, `${hStr}:00`);
        const point30Occupied = isPointOccupied("30") || isCellInPast(dayIdx, `${hStr}:30`);

        // If both half-hours are occupied or past, then this whole hour is not free
        if (point00Occupied && point30Occupied) {
          continue;
        }

        result.push(hStr);
      }

      return result;
    },
    [effectiveIntervalsByDay, isCellInPast]
  );

  // Helper to ensure slot settings exist with 60 min & 1 person default when chosen
  const ensureSlotInitialized = (key: string, currentMap: Record<string, SlotSettings>) => {
    if (!currentMap[key]) {
      const [dStr, sTime] = key.split("_");
      const existing = existingSlots?.find(
        (es) => es.date === dStr && es.start_time.slice(0, 5) === sTime
      );
      return {
        ...currentMap,
        [key]: createDefaultSlotSettings(existing),
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
    const date = weekDates[dayIdx];
    const dateStr = date ? format(date, "yyyy-MM-dd") : `${dayIdx}`;
    const dayKeys = (effectiveIntervalsByDay[dayIdx] || []).map(
      (it) => `${dateStr}_${it.start}_${it.end}`
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

  // Select all slots across currently open week
  const handleSelectAllSlots = () => {
    setSlotSettingsMap((prev) => {
      let map = { ...prev };
      allSlotKeys.forEach((k) => {
        map = ensureSlotInitialized(k, map);
      });
      return map;
    });
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      allSlotKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  // Check if a day has all its slots selected
  const isDayFullySelected = (dayIdx: number) => {
    const date = weekDates[dayIdx];
    const dateStr = date ? format(date, "yyyy-MM-dd") : `${dayIdx}`;
    const dayKeys = (effectiveIntervalsByDay[dayIdx] || []).map(
      (it) => `${dateStr}_${it.start}_${it.end}`
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


  const handleCopyConferenceLink = async (link: string) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      toast.success(language === "ru" ? "Ссылка скопирована!" : "Сілтеме көшірілді!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error(language === "ru" ? "Не удалось скопировать" : "Көшіру мүмкін болмады");
    }
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
          updateSelectedSlotsField("repeatUntil", iso);
          updateSelectedSlotsField("repeatPeriod", "custom");
          return;
        }
      }
    }
    setRepeatUntil("");
  };

  const selectedList = useMemo(() => {
    return Array.from(selectedSlotKeys).map((k) => {
      if (slotSettingsMap[k]) return slotSettingsMap[k];
      const [dStr, sTime] = k.split("_");
      const existing = existingSlots?.find(
        (es) => es.date === dStr && es.start_time.slice(0, 5) === sTime
      );
      return createDefaultSlotSettings(existing);
    });
  }, [selectedSlotKeys, slotSettingsMap, existingSlots, defaultProductId, products]);

  const isDifferentDuration = useMemo(() => {
    if (selectedList.length <= 1) return false;
    const firstDur = selectedList[0].customDuration ? Number(selectedList[0].customDuration) : selectedList[0].slotDuration;
    return selectedList.some((s) => {
      const dur = s.customDuration ? Number(s.customDuration) : s.slotDuration;
      return dur !== firstDur;
    });
  }, [selectedList]);

  const isDifferentParticipants = useMemo(() => {
    if (selectedList.length <= 1) return false;
    const firstCount = selectedList[0].customParticipants ? Number(selectedList[0].customParticipants) : selectedList[0].maxParticipants;
    return selectedList.some((s) => {
      const count = s.customParticipants ? Number(s.customParticipants) : s.maxParticipants;
      return count !== firstCount;
    });
  }, [selectedList]);

  const isDifferentProduct = useMemo(() => {
    if (selectedList.length <= 1) return false;
    const firstP = selectedList[0].productId || defaultProductId || products[0]?.id || "";
    return selectedList.some((s) => {
      const p = s.productId || defaultProductId || products[0]?.id || "";
      return p !== firstP;
    });
  }, [selectedList, defaultProductId, products]);

  const isDifferentRepeat = useMemo(() => {
    if (selectedList.length <= 1) return false;
    const firstRep = Boolean(selectedList[0].repeatWeekly);
    return selectedList.some((s) => Boolean(s.repeatWeekly) !== firstRep);
  }, [selectedList]);

  const isDifferentPeriod = useMemo(() => {
    if (selectedList.length <= 1) return false;
    const firstPeriod = selectedList[0].repeatPeriod || "1week";
    return selectedList.some((s) => (s.repeatPeriod || "1week") !== firstPeriod);
  }, [selectedList]);

  // Current values to show in right panel: if nothing selected, empty!
  const currentPanelSettings = useMemo((): SlotSettings | null => {
    if (selectedSlotKeys.size === 0) return null;
    const firstKey = Array.from(selectedSlotKeys)[0];
    if (slotSettingsMap[firstKey]) return slotSettingsMap[firstKey];
    const [dStr, sTime] = firstKey.split("_");
    const existing = existingSlots?.find(
      (es) => es.date === dStr && es.start_time.slice(0, 5) === sTime
    );
    return createDefaultSlotSettings(existing);
  }, [selectedSlotKeys, slotSettingsMap, existingSlots, defaultProductId, products]);

  const handleReady = () => {
    const isSlotInPast = (slot: { date: string; start_time: string }) => {
      const [h, m] = slot.start_time.slice(0, 5).split(":").map(Number);
      const [y, mo, d] = slot.date.split("-").map(Number);
      const slotDate = new Date(y, mo - 1, d, h, m, 0, 0);
      return slotDate.getTime() < Date.now();
    };

    const deletedSlotIds: string[] = [];
    const visitedOffsets = new Set<number>([
      weekOffset,
      ...Object.keys(cellsByWeek).map(Number),
    ]);

    visitedOffsets.forEach((offset) => {
      const oStart = addDays(realCurrentWeekStart, offset * 7);
      const oDates = Array.from({ length: 7 }, (_, i) => addDays(oStart, i));
      const oCells = offset === weekOffset ? selectedCells : cellsByWeek[offset] || new Set();

      (existingSlots || []).forEach((s) => {
        const dayIdx = oDates.findIndex((d) => format(d, "yyyy-MM-dd") === s.date);
        if (dayIdx === -1) return;
        if (isSlotInPast(s)) return;
        const startStr = s.start_time.slice(0, 5);
        const cellId = `${dayIdx}_${startStr}`;
        if (!oCells.has(cellId)) {
          if (!deletedSlotIds.includes(s.id)) {
            deletedSlotIds.push(s.id);
          }
        }
      });
    });

    if (activeDays.length === 0 && deletedSlotIds.length === 0) {
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
        productId?: string;
        title?: string;
        description?: string;
        imageUrl?: string;
        location?: string;
        repeatWeekly?: boolean;
        repeatPeriod?: "1week" | "2weeks" | "1month" | "custom" | null;
        repeatUntil?: string | null;
        lessonLink?: string;
      }[]
    > = {};

    activeDays.forEach((dayIdx) => {
      const date = weekDates[dayIdx];
      const dateStr = date ? format(date, "yyyy-MM-dd") : `${dayIdx}`;
      const intervals = effectiveIntervalsByDay[dayIdx] || [];
      daySlotsPayload[dayIdx] = intervals.map((interval) => {
        const key = `${dateStr}_${interval.start}_${interval.end}`;
        const existing = existingSlots?.find(
          (es) => es.date === dateStr && es.start_time.slice(0, 5) === interval.start
        );
        const settings = slotSettingsMap[key] || createDefaultSlotSettings(existing);
        return {
          start: interval.start,
          end: interval.end,
          productId: settings.productId || defaultProductId || products[0]?.id || undefined,
          slotDuration: settings.slotDuration || 60,
          maxParticipants: settings.maxParticipants || 1,
          title: settings.title.trim() || undefined,
          description: settings.description.trim() || undefined,
          imageUrl: settings.imageUrl.trim() || undefined,
          location: settings.location.trim() || undefined,
          repeatWeekly: Boolean(settings.repeatWeekly),
          repeatPeriod: settings.repeatWeekly ? settings.repeatPeriod || "1week" : null,
          repeatUntil: settings.repeatWeekly && settings.repeatPeriod === "custom" ? settings.repeatUntil || null : null,
          lessonLink: settings.customConferenceLink?.trim() || undefined,
        };
      });
    });

    const allIntervals = Object.values(effectiveIntervalsByDay).flat();
    const anyRepeatWeekly = Object.values(daySlotsPayload).some((dayList) =>
      dayList.some((s) => s.repeatWeekly)
    );

    onCreateSlots({
      startDate: format(weekDates[0], "yyyy-MM-dd"),
      daySlots: daySlotsPayload,
      timeIntervals: allIntervals,
      repeatDays: activeDays,
      repeatWeekly: anyRepeatWeekly,
      repeatPeriod: currentPanelSettings?.repeatPeriod || "1week",
      repeatUntil: currentPanelSettings?.repeatUntil || null,
      slotDuration: currentPanelSettings?.slotDuration || 60,
      maxParticipants: currentPanelSettings?.maxParticipants || 1,
      productId: currentPanelSettings?.productId || defaultProductId || products[0]?.id || undefined,
      title: currentPanelSettings?.title.trim() || undefined,
      description: currentPanelSettings?.description.trim() || undefined,
      imageUrl: currentPanelSettings?.imageUrl.trim() || undefined,
      location: currentPanelSettings?.location.trim() || undefined,
      lessonLink: currentPanelSettings?.customConferenceLink?.trim() || undefined,
      deletedSlotIds,
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

  const handlePrevMobileDay = () => {
    if (mobileDayIdx > 0) {
      setMobileDayIdx((prev) => prev - 1);
    } else if (weekOffset > 0) {
      changeWeek(weekOffset - 1);
      setMobileDayIdx(6);
    }
  };

  const handleNextMobileDay = () => {
    if (mobileDayIdx < 6) {
      setMobileDayIdx((prev) => prev + 1);
    } else {
      changeWeek(weekOffset + 1);
      setMobileDayIdx(0);
    }
  };

  const isPrevMobileDayDisabled = weekOffset === 0 && mobileDayIdx === 0;

  const currentMobileDate = weekDates[mobileDayIdx] || new Date();
  const isCurrentDayToday = isSameDay(currentMobileDate, new Date());

  const formattedMobileDayTitle = useMemo(() => {
    const raw = format(currentMobileDate, "EEEE, d MMMM", {
      locale: language === "ru" ? ru : kk,
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [currentMobileDate, language]);

  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleHeaderTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    const dy = e.changedTouches[0].clientY - touchStartYRef.current;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 40) {
      if (dx > 0) {
        handlePrevMobileDay();
      } else {
        handleNextMobileDay();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handleTouchStart = (cellId: string, e: React.TouchEvent) => {
    const [dStr, tStr] = cellId.split("_");
    const dayIdx = Number(dStr);
    if (isCellInPast(dayIdx, tStr)) {
      toast.info(language === "ru" ? "Нельзя выбрать прошедшее время" : "Өткен уақытты таңдау мүмкін емес");
      return;
    }

    isTouchDraggingRef.current = true;
    lastTouchCellIdRef.current = cellId;

    if (customDayIntervals[dayIdx]) {
      setCustomDayIntervals((prev) => {
        const copy = { ...prev };
        delete copy[dayIdx];
        return copy;
      });
    }

    const willSelect = !selectedCells.has(cellId);
    touchDragModeRef.current = willSelect ? "select" : "deselect";

    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (willSelect) next.add(cellId);
      else next.delete(cellId);
      return next;
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTouchDraggingRef.current) return;
    if (!e.touches || e.touches.length === 0) return;

    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cellBtn = el?.closest("[data-cell-id]") as HTMLElement | null;
    const cellId = cellBtn?.getAttribute("data-cell-id");

    if (cellId && cellId !== lastTouchCellIdRef.current) {
      lastTouchCellIdRef.current = cellId;
      const [dStr, tStr] = cellId.split("_");
      const dayIdx = Number(dStr);
      if (!isCellInPast(dayIdx, tStr)) {
        if (customDayIntervals[dayIdx]) {
          setCustomDayIntervals((prev) => {
            const copy = { ...prev };
            delete copy[dayIdx];
            return copy;
          });
        }

        const mode = touchDragModeRef.current;
        setSelectedCells((prev) => {
          const next = new Set(prev);
          if (mode === "select") next.add(cellId);
          else next.delete(cellId);
          return next;
        });
      }
    }

    if (scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const threshold = 55;
      if (touch.clientY < rect.top + threshold) {
        scrollContainerRef.current.scrollTop -= 10;
      } else if (touch.clientY > rect.bottom - threshold) {
        scrollContainerRef.current.scrollTop += 10;
      }
    }
  };

  const handleTouchEnd = () => {
    isTouchDraggingRef.current = false;
    lastTouchCellIdRef.current = null;
  };

  const removeDayInterval = (dayIdx: number, intervalIndex: number) => {
    const currentIntervals = effectiveIntervalsByDay[dayIdx] || [];
    const target = currentIntervals[intervalIndex];
    if (!target) return;

    const [sh, sm] = target.start.split(":").map(Number);
    const [eh, em] = target.end.split(":").map(Number);
    let startMinutes = sh * 60 + sm;
    let endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }

    setSelectedCells((prev) => {
      const next = new Set(prev);
      for (let m = startMinutes; m < endMinutes; m += 30) {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        const cellId = `${dayIdx}_${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        next.delete(cellId);
      }
      return next;
    });

    if (customDayIntervals[dayIdx]) {
      setCustomDayIntervals((prev) => {
        const copy = { ...prev };
        delete copy[dayIdx];
        return copy;
      });
    }
  };

  const renderMobileHourRow = (h: number, isLate: boolean = false) => {
    const hourStr = String(h).padStart(2, "0");
    const halfHours = [0, 30];
    const isFirstLateHour = isLate && lateHoursArr.length > 0 && h === lateHoursArr[0];

    const visibleHalfHours = halfHours.filter((m) => {
      const minuteStr = String(m).padStart(2, "0");
      const timeStr = `${hourStr}:${minuteStr}`;
      if (isLate) {
        return timeStr >= workingHours.end;
      }
      return timeStr >= workingHours.start && timeStr < workingHours.end;
    });

    if (visibleHalfHours.length === 0) return null;

    return (
      <div key={`${isLate ? "late_" : ""}${h}`} className="grid grid-cols-[64px_1fr] relative">
        <div className="relative border-r border-border/60 select-none bg-muted/20">
          {!isFirstLateHour && (
            <span className="absolute top-0 -translate-y-1/2 right-2 text-xs font-mono font-medium text-foreground/80">
              {hourStr}:00
            </span>
          )}
        </div>
        <div className="flex flex-col" style={{ touchAction: "none" }}>
          {visibleHalfHours.map((m) => {
            const minuteStr = String(m).padStart(2, "0");
            const timeStr = `${hourStr}:${minuteStr}`;
            const cellId = `${mobileDayIdx}_${timeStr}`;
            const isSelected = selectedCells.has(cellId);
            const isPast = isCellInPast(mobileDayIdx, timeStr);

            return (
              <button
                key={m}
                type="button"
                data-cell-id={cellId}
                onTouchStart={(e) => handleTouchStart(cellId, e)}
                onMouseDown={(e) => handleCellMouseDown(cellId, e)}
                onMouseEnter={() => handleCellMouseEnter(cellId)}
                className={cn(
                  "h-6 w-full transition-colors select-none",
                  m === 0 ? "border-t border-foreground/35" : "border-t border-border/75",
                  isPast
                    ? "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] cursor-not-allowed opacity-80"
                    : isSelected
                    ? "bg-primary border-t border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)] cursor-pointer"
                    : "hover:bg-primary/15 active:bg-primary/25 cursor-pointer bg-card"
                )}
              />
            );
          })}
        </div>
      </div>
    );
  };

  // 30-min hour row
  const renderHourRow = (h: number, isLate: boolean = false) => {
    const hourStr = String(h).padStart(2, "0");
    const halfHours = [0, 30];
    const isFirstLateHour = isLate && lateHoursArr.length > 0 && h === lateHoursArr[0];

    const visibleHalfHours = halfHours.filter((m) => {
      const minuteStr = String(m).padStart(2, "0");
      const timeStr = `${hourStr}:${minuteStr}`;
      if (isLate) {
        return timeStr >= workingHours.end;
      }
      return timeStr >= workingHours.start && timeStr < workingHours.end;
    });

    if (visibleHalfHours.length === 0) return null;

    return (
      <div key={`${isLate ? "late_" : ""}${h}`} className="grid grid-cols-[64px_repeat(7,1fr)] relative">
        <div className="relative border-r border-border/60 select-none">
          {!isFirstLateHour && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs sm:text-[13px] font-mono font-medium text-foreground/80">
              {hourStr}:00
            </span>
          )}
        </div>
        {Array.from({ length: 7 }).map((_, dayIdx) => (
          <div key={dayIdx} className="border-r last:border-r-0 border-foreground/35 flex flex-col">
            {visibleHalfHours.map((m) => {
              const minuteStr = String(m).padStart(2, "0");
              const timeStr = `${hourStr}:${minuteStr}`;
              const cellId = `${dayIdx}_${timeStr}`;
              const isSelected = selectedCells.has(cellId);
              const isPast = isCellInPast(dayIdx, timeStr);
              return (
                <button
                  key={m}
                  type="button"
                  onMouseDown={(e) => handleCellMouseDown(cellId, e)}
                  onMouseEnter={() => handleCellMouseEnter(cellId)}
                  onTouchStart={() => toggleCell(cellId)}
                  className={cn(
                    "h-5 sm:h-6 w-full transition-colors select-none",
                    m === 0 ? "border-t border-foreground/35" : "border-t border-border/75",
                    isPast
                      ? "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] cursor-not-allowed opacity-80"
                      : isSelected
                      ? "bg-primary border-t border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)] cursor-pointer"
                      : "hover:bg-primary/20 active:bg-primary/30 cursor-pointer"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // Selected intervals grouped by day, each time editable (desktop column and expanded phone panel)
  const renderTimesByDay = () =>
    editableDaysOnDesktop.map((dayIdx) => {
      const dayEditableIntervals = (effectiveIntervalsByDay[dayIdx] || [])
        .map((interval, originalIdx) => ({ interval, originalIdx }))
        .filter(({ interval }) => !isIntervalUnderGrid(dayIdx, interval));

      return (
        <div
          key={dayIdx}
          className="py-2.5 px-3.5 sm:py-3 sm:px-4 rounded-xl border border-border bg-card shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-foreground">
              {t.weekDaysFull[dayIdx]}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {dayEditableIntervals.map(({ interval, originalIdx }) => (
              <div
                key={originalIdx}
                className="text-xs font-mono gap-0.5 px-1.5 sm:px-2 py-0.5 rounded-md border border-border/70 bg-muted/60 hover:bg-muted items-center justify-center flex w-full"
              >
                <EditableTime
                  time={interval.start}
                  availableHours={getAvailableHoursForDay(dayIdx, interval.start, originalIdx, false)}
                  isTimeInPast={(timeStr) => isCellInPast(dayIdx, timeStr)}
                  language={language}
                  onChange={(newTime, isSilent) =>
                    updateIntervalTime(dayIdx, originalIdx, newTime, interval.end, isSilent)
                  }
                />
                <span className="mx-0.5 text-muted-foreground">–</span>
                <EditableTime
                  time={interval.end}
                  availableHours={getAvailableHoursForDay(
                    dayIdx,
                    interval.end,
                    originalIdx,
                    true,
                    addMinutesToTime(interval.start, 30)
                  )}
                  minTime={addMinutesToTime(interval.start, 30)}
                  isTimeInPast={(timeStr) => isCellInPast(dayIdx, timeStr)}
                  language={language}
                  onChange={(newTime, isSilent) =>
                    updateIntervalTime(dayIdx, originalIdx, interval.start, newTime, isSilent)
                  }
                />
              </div>
            ))}
          </div>
        </div>
      );
    });

  // "Неделя" label with previous / next week arrows side by side, in the time column header
  const renderWeekArrows = () => (
    <div className="flex flex-col items-center justify-center gap-1">
      <span className="text-[11px] font-semibold text-muted-foreground">{language === "ru" ? "Неделя" : "Апта"}</span>
      <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          changeWeek(weekOffset - 1);
        }}
        disabled={weekOffset === 0}
        className="w-6 h-6 rounded-full bg-card border border-border/80 hover:border-primary/40 hover:bg-primary/10 hover:text-primary flex items-center justify-center text-foreground/80 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:text-foreground/80 disabled:hover:border-border/80"
        title={language === "ru" ? "Предыдущая неделя" : "Алдыңғы апта"}
        aria-label={language === "ru" ? "Предыдущая неделя" : "Алдыңғы апта"}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          changeWeek(weekOffset + 1);
        }}
        className="w-6 h-6 rounded-full bg-card border border-border/80 hover:border-primary/40 hover:bg-primary/10 hover:text-primary flex items-center justify-center text-foreground/80 transition-colors cursor-pointer"
        title={language === "ru" ? "Следующая неделя" : "Келесі апта"}
        aria-label={language === "ru" ? "Следующая неделя" : "Келесі апта"}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      </div>
    </div>
  );

  // Step 2: one day's interval blocks, split into lessons with breaks (desktop columns and the phone day view)
  const renderStep2DayBlocks = (dayIdx: number) => {
    const intervals = (effectiveIntervalsByDay[dayIdx] || []).filter(
      (interval) => !isIntervalUnderGrid(dayIdx, interval)
    );
    const startHour = displayHours[0] ?? 9;
    const getMinutesFromStart = (timeStr: string) => {
      const [h, m] = timeStr.split(":").map(Number);
      let diffHours = h - startHour;
      if (diffHours < 0) diffHours += 24;
      return diffHours * 60 + m;
    };
    const pixelsPerMinute = 48 / 60;

    return intervals.map((interval) => {
      const date = weekDates[dayIdx];
      const dateStr = date ? format(date, "yyyy-MM-dd") : `${dayIdx}`;
      const key = `${dateStr}_${interval.start}_${interval.end}`;
      const isSelected = selectedSlotKeys.has(key);

      const startM = getMinutesFromStart(interval.start);
      let endM = getMinutesFromStart(interval.end);
      if (endM <= startM) endM += 24 * 60;
      const durationM = Math.max(30, endM - startM);
      const topPx = startM * pixelsPerMinute;
      const heightPx = Math.max(24, durationM * pixelsPerMinute);
      const lessonDuration = slotSettingsMap[key]?.slotDuration ?? 60;
      const lessons = lessonDuration > 0 ? splitIntoLessons(0, durationM, lessonDuration) : [];

      return (
        <div
          key={key}
          onClick={(e) => {
            e.stopPropagation();
            toggleSlotSelection(key);
          }}
          style={{ top: `${topPx}px`, height: `${heightPx}px` }}
          className={cn(
            "group absolute left-0 right-0 transition-colors cursor-pointer select-none overflow-hidden",
            isSelected ? "bg-primary text-primary-foreground z-20" : "bg-card text-primary z-10"
          )}
          title={`${interval.start} - ${interval.end}`}
        >
          {!isSelected && (
            <div className="absolute inset-0 bg-primary/15 group-hover:bg-primary/25 transition-colors pointer-events-none" />
          )}
          {lessons.map((lesson, li) => {
            if (lesson.end >= durationM) return null;
            const nextStart = li + 1 < lessons.length ? lessons[li + 1].start : durationM;
            const reachesBlockEnd = nextStart >= durationM;
            // The block sits exactly on the grid, so y = t * pixelsPerMinute is time t.
            // A break that runs into the block end loses 1px to the outline, so it is lifted by 1px
            // to look as tall as the breaks inside the block.
            const lineTop = lesson.end * pixelsPerMinute - (reachesBlockEnd ? 1 : 0);
            const breakHeight = (nextStart - lesson.end) * pixelsPerMinute;
            return [
              <div
                key={`lesson-line-${li}`}
                className={cn("absolute left-0 right-0 h-px pointer-events-none", isSelected ? "bg-white/70" : "bg-primary/50")}
                style={{ top: `${lineTop}px` }}
              />,
              nextStart > lesson.end ? (
                <div
                  key={`lesson-break-${li}`}
                  className={cn("absolute left-0 right-0 pointer-events-none", isSelected ? "bg-white/45" : "bg-muted-foreground/25")}
                  style={reachesBlockEnd ? { top: `${lineTop}px`, bottom: 0 } : { top: `${lineTop}px`, height: `${breakHeight}px` }}
                />
              ) : null,
            ];
          })}
          <div
            className={cn(
              "absolute inset-0 border pointer-events-none z-30",
              isSelected ? "border-primary" : "border-primary/40 group-hover:border-primary/60"
            )}
          />
        </div>
      );
    });
  };

  // Hour labels for the step 2 time column: one per hour line, including the closing line
  const step2HourLabels = useMemo(() => {
    const first = displayHours[0] ?? 9;
    return Array.from({ length: displayHours.length + 1 }, (_, i) => `${String((first + i) % 24).padStart(2, "0")}:00`);
  }, [displayHours]);

  // Step switcher: two numbered circles joined by a grey line. Hovering the other step's circle
  // turns that circle and the line light orange; each circle shows a "Шаг N" tooltip.
  const renderStepSwitcher = () => {
    const stepLabel = (n: 1 | 2) => (language === "ru" ? `Шаг ${n}` : `${n}-қадам`);
    const circle = (n: 1 | 2) => {
      const isActive = step === n;
      const isHovered = hoveredStep === n && !isActive;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleStepChange(n)}
              onMouseEnter={() => setHoveredStep(n)}
              onMouseLeave={() => setHoveredStep(null)}
              disabled={n === 2 && editableDaysOnDesktop.length === 0}
              aria-label={stepLabel(n)}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : isHovered
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {n}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{stepLabel(n)}</TooltipContent>
        </Tooltip>
      );
    };
    const isOtherStepHovered = hoveredStep !== null && hoveredStep !== step;
    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex items-center gap-2">
          {circle(1)}
          <div className={cn("h-1 w-12 rounded-full transition-colors", isOtherStepHovered ? "bg-primary/30" : "bg-muted")} />
          {circle(2)}
        </div>
      </TooltipProvider>
    );
  };

  const lateMaxHeight = lateHoursArr.length * 2 * 24 + 32;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-full h-full max-h-full m-0 p-0 rounded-none sm:rounded-none flex flex-col bg-background overflow-hidden border-0 gap-0 z-50"
      >
        <VisuallyHidden>
          <DialogTitle>Slot Creation Wizard</DialogTitle>
        </VisuallyHidden>

        {/* Top Header: Title (left) | Step Switcher (strictly centered) | Ready (far right, no cross) */}
        <header className="flex-none relative flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-card">
          {/* Left: Wizard title */}
          <div className="flex items-center gap-3">
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-foreground whitespace-normal leading-tight">
              {step === 1 ? t.wizTitleStep1 : t.wizTitleStep2}
            </h2>
          </div>

          {/* Center on desktop: 2-step switcher strictly in center */}
          <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center justify-center">
            {renderStepSwitcher()}
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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-auto sm:pb-8">
          {/* STEP 1: Time Selection */}
          {step === 1 && (
            <>
              {/* MOBILE STEP 1: Single day grid with arrows */}
              <div
                className="block sm:hidden p-3 space-y-2.5"
                style={{ paddingBottom: `${mobileBottomBarHeight + 8}px` }}
              >
                {/* Day Switcher Bar with < and > */}
                <div
                  className="flex items-center justify-between gap-2 px-2 py-2 bg-card border border-border/80 rounded-xl shadow-2xs"
                  onTouchStart={handleHeaderTouchStart}
                  onTouchEnd={handleHeaderTouchEnd}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevMobileDay}
                    disabled={isPrevMobileDayDisabled}
                    className="h-9 w-9 shrink-0 rounded-lg hover:bg-muted active:bg-muted/80 disabled:opacity-30 cursor-pointer"
                    aria-label={language === "ru" ? "Предыдущий день" : "Алдыңғы күн"}
                  >
                    <ChevronLeft className="w-5 h-5 text-foreground" />
                  </Button>

                  <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1 text-center">
                    <span className="text-sm sm:text-base font-bold text-foreground capitalize truncate">
                      {formattedMobileDayTitle}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleNextMobileDay}
                    className="h-9 w-9 shrink-0 rounded-lg hover:bg-muted active:bg-muted/80 cursor-pointer"
                    aria-label={language === "ru" ? "Следующий день" : "Келесі күн"}
                  >
                    <ChevronRight className="w-5 h-5 text-foreground" />
                  </Button>
                </div>

                {/* Single Day Grid */}
                <div
                  className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none"
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                >
                  {/* Grid header: Время (left) | Timezone button (right) */}
                  <div className="grid grid-cols-[64px_1fr] bg-muted/50 border-b border-border sticky top-0 z-10">
                    <div className="py-2 text-center border-r border-border/60 flex items-center justify-center">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {language === "ru" ? "Время" : "Уақыт"}
                      </span>
                    </div>
                    <div className="py-2 px-2 text-center flex items-center justify-center">
                      {isCurrentDayToday && (
                        <span className="text-xs font-semibold text-primary">
                          {language === "ru" ? "Сегодня" : "Бүгін"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Top spacer matching bottom padding so 09:00 doesn't collide with header */}
                  <div className="grid grid-cols-[64px_1fr] select-none pointer-events-none">
                    <div className="border-r border-border/60 h-3 bg-muted/20" />
                    <div
                      className={cn(
                        "h-3",
                        isCellInPast(mobileDayIdx, workingHours.start) &&
                          "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] opacity-80"
                      )}
                    />
                  </div>

                  {/* Standard working hours */}
                  <div>
                    {baseHours.map((h) => renderMobileHourRow(h, false))}

                    {/* Stationary boundary label (e.g. 21:00) */}
                    <div className="relative grid grid-cols-[64px_1fr] select-none pointer-events-none">
                      <div className="relative border-r border-border/60 h-0 bg-muted/20">
                        {!workingHours.end.endsWith(":30") && (
                          <span className="absolute top-0 -translate-y-1/2 right-2 text-xs font-mono font-medium text-foreground/80">
                            {workingHours.end}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Late hours */}
                    <div
                      className="overflow-hidden transition-[max-height] duration-700 ease-in-out"
                      style={{
                        maxHeight: showLateHours ? `${lateMaxHeight}px` : "0px",
                      }}
                    >
                      {lateHoursArr.map((h) => renderMobileHourRow(h, true))}
                    </div>

                    {/* Final closing line */}
                    <div className="grid grid-cols-[64px_1fr] relative">
                      <div className="relative border-r border-border/60 h-3 select-none bg-muted/20">
                        {showLateHours && lateHoursArr.length > 0 && (
                          <span className="absolute top-0 -translate-y-1/2 right-2 text-xs font-mono font-medium text-foreground/80">
                            {closingHourStr}
                          </span>
                        )}
                      </div>
                      <div
                        className={cn(
                          "h-3 border-t",
                          !showLateHours && workingHours.end.endsWith(":30")
                            ? "border-border/75"
                            : "border-foreground/35",
                          isCellInPast(mobileDayIdx, closingHourStr) &&
                            "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] opacity-80"
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Mobile Toolbar under grid */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3 mb-2 px-0.5">
                  {/* Left: Time range */}
                  <div className="flex justify-start">
                    <Popover
                      open={isMobileRangeOpen}
                      onOpenChange={(nextOpen) => {
                        setIsMobileRangeOpen(nextOpen);
                        if (nextOpen) {
                          setTempWorkingHours(workingHours);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-8 px-2.5 rounded-lg border-border text-foreground bg-card shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-medium transition-colors group",
                            isMobileRangeOpen
                              ? "bg-primary text-white border-primary hover:bg-primary hover:text-white hover:border-primary"
                              : "hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                          )}
                          title={t.timeRangeBtn}
                        >
                          <Clock
                            className={cn(
                              "w-3.5 h-3.5 text-foreground transition-colors group-hover:text-primary",
                              isMobileRangeOpen && "text-white group-hover:text-white"
                            )}
                          />
                          <span>{language === "ru" ? "Диапазон" : "Ауқым"}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        sideOffset={8}
                        className="w-64 p-3 bg-card border border-border rounded-xl shadow-2xl z-50 select-none"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <TimeRangePickerContent
                          tempWorkingHours={tempWorkingHours}
                          setTempWorkingHours={setTempWorkingHours}
                          onApply={() => {
                            setWorkingHours(tempWorkingHours);
                            setIsMobileRangeOpen(false);
                          }}
                          t={t}
                          language={language}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Center: Late hours toggle */}
                  {lateHoursArr.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleToggleLateHours}
                      className="text-xs font-medium text-foreground hover:bg-primary/15 hover:text-primary hover:border-primary/40 active:bg-primary/20 gap-1 rounded-lg px-3 h-8 border border-border bg-card transition-colors group cursor-pointer"
                    >
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-active:text-primary transition-transform duration-300",
                          showLateHours && "rotate-180"
                        )}
                      />
                      <span className="group-hover:text-primary group-active:text-primary transition-colors">
                        {showLateHours
                          ? language === "ru"
                            ? "Скрыть"
                            : "Жасыру"
                          : language === "ru"
                          ? "Показать"
                          : "Көрсету"}
                      </span>
                    </Button>
                  ) : (
                    <div />
                  )}

                  {/* Right: Clear all with popover */}
                  <div className="flex justify-end">
                    {activeDays.length > 0 && (
                      <Popover open={isMobileConfirmClearOpen} onOpenChange={setIsMobileConfirmClearOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                            title={t.clearAll}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            <span>{language === "ru" ? "Удалить" : "Жою"}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3 shadow-lg" align="end">
                          <div className="flex items-center gap-3">
                          <p className="text-sm font-medium text-left text-foreground">
                            {weekOffset === 0 ? t.confirmClearRemainingTitle : t.confirmClearAllTitle}
                          </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 px-3 shrink-0 text-base font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={async () => {
                                const dates = weekDates.map((d) => format(d, "yyyy-MM-dd"));
                                setSelectedCells(new Set());
                                setCustomDayIntervals({});
                                setSlotSettingsMap({});
                                setSelectedSlotKeys(new Set());
                                setCellsByWeek((prev) => ({
                                  ...prev,
                                  [weekOffset]: new Set(),
                                }));
                                setIsMobileConfirmClearOpen(false);
                                if (onDeleteSlots) {
                                  await onDeleteSlots(dates);
                                }
                              }}
                            >
                              {t.yes}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              </div>

              {/* DESKTOP STEP 1: 7-day grid */}
              <div className="hidden sm:flex gap-5 p-2 sm:p-4 min-w-[750px]">
              {/* Left: Schedule grid */}
              <div className="flex-1 min-w-0">
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none">
                  {/* Grid header with days */}
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-muted/50 border-b border-border sticky top-0 z-10">
                    <div className="border-r border-border/60 flex items-center justify-center">
                      {renderWeekArrows()}
                    </div>
                    {t.weekDays.map((dayName, idx) => {
                      const date = weekDates[idx];
                      const isCur = isSameDay(date, new Date());
                      const hasSlots = Boolean(
                        effectiveIntervalsByDay[idx] &&
                        effectiveIntervalsByDay[idx].some((intv) => !isIntervalUnderGrid(idx, intv))
                      );
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "py-2 px-1 text-center border-r last:border-r-0 border-border/60 flex flex-col items-center justify-center transition-colors relative",
                            hasSlots && "bg-primary/15"
                          )}
                        >
                          <span className="text-[11px] font-semibold text-muted-foreground">{dayName}</span>
                          <div
                            className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5",
                              isCur
                                ? hasSlots
                                  ? "bg-primary/20 text-foreground"
                                  : "bg-muted-foreground/15 text-foreground"
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
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-muted/10">
                    <div className="border-r border-border/60 h-2 sm:h-2.5" />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "border-r last:border-r-0 border-foreground/35 h-2 sm:h-2.5",
                          isCellInPast(i, workingHours.start) &&
                            "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] opacity-80"
                        )}
                      />
                    ))}
                  </div>

                  {/* Hours rows */}
                  <div className="bg-card">
                    {baseHours.map((h) => renderHourRow(h, false))}

                    {/* Stationary boundary label (e.g. 21:00) */}
                    <div className="relative grid grid-cols-[64px_repeat(7,1fr)] select-none pointer-events-none">
                      <div className="relative border-r border-border/60 h-0">
                        {!workingHours.end.endsWith(":30") && (
                          <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs sm:text-[13px] font-mono font-medium text-foreground/80">
                            {workingHours.end}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Late hours */}
                    <div
                      className="overflow-hidden transition-[max-height] duration-700 ease-in-out"
                      style={{
                        maxHeight: showLateHours ? `${lateMaxHeight}px` : "0px",
                      }}
                    >
                      {lateHoursArr.map((h) => renderHourRow(h, true))}
                    </div>

                    {/* Final closing line */}
                    <div className="grid grid-cols-[64px_repeat(7,1fr)] relative">
                      <div className="relative border-r border-border/60 h-3 select-none">
                        {showLateHours && lateHoursArr.length > 0 && (
                          <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs sm:text-[13px] font-mono font-medium text-foreground/80">
                            {closingHourStr}
                          </span>
                        )}
                      </div>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "border-r last:border-r-0 border-foreground/35 border-t h-3",
                            !showLateHours && workingHours.end.endsWith(":30")
                              ? "border-t-border/75"
                              : "border-t-foreground/35",
                            isCellInPast(i, closingHourStr) &&
                              "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] opacity-80"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom toolbar under grid */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3 mb-2 px-1">
                  {/* Left: Time range */}
                  <div className="flex justify-start">
                    <Popover
                      open={isRangeOpen}
                      onOpenChange={(nextOpen) => {
                        setIsRangeOpen(nextOpen);
                        if (nextOpen) {
                          setTempWorkingHours(workingHours);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-xs h-8 gap-1.5 rounded-md px-3 font-medium border-border text-foreground bg-card shadow-sm transition-colors group cursor-pointer",
                            isRangeOpen
                              ? "bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground hover:border-primary"
                              : "hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                          )}
                        >
                          <Clock
                            className={cn(
                              "w-3.5 h-3.5 text-muted-foreground transition-colors group-hover:text-primary",
                              isRangeOpen && "text-primary-foreground group-hover:text-primary-foreground"
                            )}
                          />
                          <span>{t.timeRangeBtn}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-64 p-3 bg-card border border-border rounded-xl shadow-xl z-50 select-none"
                        align="start"
                        sideOffset={8}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <TimeRangePickerContent
                          tempWorkingHours={tempWorkingHours}
                          setTempWorkingHours={setTempWorkingHours}
                          onApply={() => {
                            setWorkingHours(tempWorkingHours);
                            setIsRangeOpen(false);
                          }}
                          t={t}
                          language={language}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Center: Toggle late hours */}
                  {lateHoursArr.length > 0 ? (
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
                  ) : (
                    <div />
                  )}

                  {/* Right: Clear all with popover */}
                  <div className="flex justify-end">
                    {activeDays.length > 0 && (
                      <Popover open={isConfirmClearOpen} onOpenChange={setIsConfirmClearOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 rounded-full px-3 whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t.clearAll}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3 shadow-lg" align="end">
                          <div className="flex items-center gap-3">
                          <p className="text-sm sm:text-base font-medium text-left text-foreground">
                            {weekOffset === 0 ? t.confirmClearRemainingTitle : t.confirmClearAllTitle}
                          </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 px-3 shrink-0 text-base font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={async () => {
                                const dates = weekDates.map((d) => format(d, "yyyy-MM-dd"));
                                setSelectedCells(new Set());
                                setCustomDayIntervals({});
                                setSlotSettingsMap({});
                                setSelectedSlotKeys(new Set());
                                setCellsByWeek((prev) => ({
                                  ...prev,
                                  [weekOffset]: new Set(),
                                }));
                                setIsConfirmClearOpen(false);
                                if (onDeleteSlots) {
                                  await onDeleteSlots(dates);
                                }
                              }}
                            >
                              {t.yes}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Summary panel — "Расписание:" */}
              <div className="w-80 sm:w-96 md:w-[410px] flex-none">
                <div className="sticky top-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-base sm:text-[17px] font-medium text-foreground">
                      {t.repeatSummary}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {editableDaysOnDesktop.length === 0 ? (
                      <div className="p-4 border rounded-xl text-center text-xs sm:text-sm text-muted-foreground border-dashed bg-card/50">
                        {t.noSlotsWarning}
                      </div>
                    ) : (
                      renderTimesByDay()
                    )}
                  </div>
                </div>
              </div>
            </div>
            </>
          )}

          {/* STEP 2: Configure Slot Groups */}
          {step === 2 && (
            <>
              {/* MOBILE STEP 2: day grid with blocks; parameters live in the bottom panel */}
              <div
                className="block sm:hidden p-3 space-y-2.5"
                style={{ paddingBottom: `${mobileBottomBarHeight + 8}px` }}
              >
                {/* Day Switcher Bar with < and > */}
                <div
                  className="flex items-center justify-between gap-2 px-2 py-2 bg-card border border-border/80 rounded-xl shadow-2xs"
                  onTouchStart={handleHeaderTouchStart}
                  onTouchEnd={handleHeaderTouchEnd}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevMobileDay}
                    disabled={isPrevMobileDayDisabled}
                    className="h-9 w-9 shrink-0 rounded-lg hover:bg-muted active:bg-muted/80 disabled:opacity-30 cursor-pointer"
                    aria-label={language === "ru" ? "Предыдущий день" : "Алдыңғы күн"}
                  >
                    <ChevronLeft className="w-5 h-5 text-foreground" />
                  </Button>
                  <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1 text-center">
                    <span className="text-sm sm:text-base font-bold text-foreground capitalize truncate">
                      {formattedMobileDayTitle}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleNextMobileDay}
                    className="h-9 w-9 shrink-0 rounded-lg hover:bg-muted active:bg-muted/80 cursor-pointer"
                    aria-label={language === "ru" ? "Следующий день" : "Келесі күн"}
                  >
                    <ChevronRight className="w-5 h-5 text-foreground" />
                  </Button>
                </div>

                {/* Single day grid: time column + blocks, same layout as step 1 */}
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none">
                  <div className="grid grid-cols-[64px_1fr] bg-muted/50 border-b border-border">
                    <div className="py-2 text-center border-r border-border/60 flex items-center justify-center">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {language === "ru" ? "Время" : "Уақыт"}
                      </span>
                    </div>
                    <div className="py-2 px-2 text-center flex items-center justify-center">
                      {isCurrentDayToday && (
                        <span className="text-xs font-semibold text-primary">
                          {language === "ru" ? "Сегодня" : "Бүгін"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-[64px_1fr] pointer-events-none">
                    <div className="border-r border-border/60 h-3 bg-muted/20" />
                    <div className="h-3" />
                  </div>
                  <div className="grid grid-cols-[64px_1fr]">
                    <div className="relative border-r border-border/60 bg-muted/20 select-none pointer-events-none">
                      {step2HourLabels.map((label, i) => (
                        <span
                          key={label + i}
                          className="absolute right-2 -translate-y-1/2 text-xs font-mono font-medium text-foreground/80"
                          style={{ top: `${i * 48}px` }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div
                      onClick={(e) => {
                        if (e.target === e.currentTarget) {
                          setSelectedSlotKeys(new Set());
                        }
                      }}
                      className="relative border-t border-foreground/35"
                      style={{ height: `${displayHours.length * 48}px` }}
                    >
                      <div className="absolute inset-0 pointer-events-none flex flex-col">
                        {displayHours.map((_, i) => (
                          <div key={i} className="border-b border-foreground/35" style={{ height: "48px" }} />
                        ))}
                      </div>
                      {renderStep2DayBlocks(mobileDayIdx)}
                    </div>
                  </div>
                  <div className="grid grid-cols-[64px_1fr] pointer-events-none">
                    <div className="border-r border-border/60 h-3 bg-muted/20" />
                    <div className="h-3" />
                  </div>
                </div>

                {/* Toolbar: select all (left) / late hours (center) / unselect (right) for this day */}
                {(() => {
                  const dayPrefix = format(currentMobileDate, "yyyy-MM-dd") + "_";
                  const daySlotKeys = allSlotKeys.filter((k) => k.startsWith(dayPrefix));
                  const selectedCount = daySlotKeys.filter((k) => selectedSlotKeys.has(k)).length;
                  return (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3 mb-2 px-0.5">
                      <div className="flex justify-start">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={daySlotKeys.length === 0 || selectedCount === daySlotKeys.length}
                          onClick={() => {
                            setSlotSettingsMap((prev) => {
                              let map = { ...prev };
                              daySlotKeys.forEach((k) => {
                                map = ensureSlotInitialized(k, map);
                              });
                              return map;
                            });
                            setSelectedSlotKeys((prev) => {
                              const next = new Set(prev);
                              daySlotKeys.forEach((k) => next.add(k));
                              return next;
                            });
                          }}
                          className="h-8 px-2.5 text-xs font-medium rounded-lg bg-card text-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40 disabled:opacity-40"
                        >
                          {t.selectAll}
                        </Button>
                      </div>
                      {lateHoursArr.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleToggleLateHours}
                          className="text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 gap-1 rounded-lg px-3 h-8 border border-border bg-card transition-colors cursor-pointer"
                        >
                          <ChevronDown
                            className={cn("w-3.5 h-3.5 transition-transform duration-300", showLateHours && "rotate-180")}
                          />
                          <span>
                            {showLateHours
                              ? language === "ru" ? "Скрыть" : "Жасыру"
                              : language === "ru" ? "Показать" : "Көрсету"}
                          </span>
                        </Button>
                      ) : (
                        <div />
                      )}
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={selectedCount === 0}
                          onClick={() => {
                            setSelectedSlotKeys((prev) => {
                              const next = new Set(prev);
                              daySlotKeys.forEach((k) => next.delete(k));
                              return next;
                            });
                          }}
                          className="h-8 px-2.5 text-xs font-medium rounded-lg bg-card text-destructive border-destructive/40 hover:bg-destructive hover:text-white hover:border-destructive disabled:opacity-40"
                        >
                          {t.unselectAll}
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* DESKTOP STEP 2: 7-day schedule grid with right sidebar */}
              <div
                onClick={() => setSelectedSlotKeys(new Set())}
                className="hidden sm:flex gap-5 p-2 sm:p-4 min-w-[750px]"
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
                  {/* 7 Days Header (Mon-Sun) with week arrows in the time column */}
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-muted/50 border-b border-border sticky top-0 z-10">
                    <div className="border-r border-border/60 flex items-center justify-center">
                      {renderWeekArrows()}
                    </div>
                    {t.weekDays.map((dayName, idx) => {
                      const date = weekDates[idx];
                      const isCur = isSameDay(date, new Date());
                      const dateStr = format(date, "yyyy-MM-dd");
                      const isDaySelectedInStep2 = Array.from(selectedSlotKeys).some((key) => key.startsWith(`${dateStr}_`));
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "py-2 px-1 text-center border-r last:border-r-0 border-border/60 flex flex-col items-center justify-center transition-colors",
                            isDaySelectedInStep2 && "bg-primary/15"
                          )}
                        >
                          <span className="text-[11px] font-semibold text-muted-foreground">{dayName}</span>
                          <div
                            className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5",
                              isCur
                                ? isDaySelectedInStep2
                                  ? "bg-primary/20 text-foreground"
                                  : "bg-muted-foreground/15 text-foreground"
                                : "text-foreground"
                            )}
                          >
                            {format(date, "d")}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Top spacer, same as step 1 */}
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-muted/10 pointer-events-none">
                    <div className="border-r border-border/60 h-2.5" />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="border-r last:border-r-0 border-foreground/35 h-2.5" />
                    ))}
                  </div>

                  {/* Time column + timeline */}
                  <div className="grid grid-cols-[64px_1fr]">
                    <div className="relative border-r border-border/60 select-none pointer-events-none">
                      {step2HourLabels.map((label, i) => (
                        <span
                          key={label + i}
                          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs sm:text-[13px] font-mono font-medium text-foreground/80"
                          style={{ top: `${i * 48}px` }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div
                      onClick={(e) => {
                        if (e.target === e.currentTarget) {
                          setSelectedSlotKeys(new Set());
                        }
                      }}
                      className="relative bg-card border-t border-foreground/35"
                      style={{ height: `${displayHours.length * 48}px` }}
                    >
                      {/* Background horizontal hour lines */}
                      <div className="absolute inset-0 pointer-events-none flex flex-col">
                        {displayHours.map((_, i) => (
                          <div key={i} className="border-b border-foreground/35" style={{ height: "48px" }} />
                        ))}
                      </div>

                      {/* 7 Day Columns */}
                      <div className="relative grid grid-cols-7 h-full">
                        {Array.from({ length: 7 }).map((_, dayIdx) => (
                          <div
                            key={dayIdx}
                            onClick={(e) => {
                              if (e.target === e.currentTarget) {
                                setSelectedSlotKeys(new Set());
                              }
                            }}
                            className="relative h-full border-r last:border-r-0 border-foreground/35"
                          >
                            {renderStep2DayBlocks(dayIdx)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Bottom spacer, same as step 1 */}
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] pointer-events-none">
                    <div className="border-r border-border/60 h-3" />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="border-r last:border-r-0 border-foreground/35 h-3" />
                    ))}
                  </div>
                </div>

                {/* Toolbar under schedule: Select All (left) / late-hours toggle (center) / Unselect All (right) */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-between gap-2 mt-3 mb-2 px-1"
                >
                  {(() => {
                    const selectedCount = allSlotKeys.filter((k) => selectedSlotKeys.has(k)).length;
                    const selectAllDisabled = allSlotKeys.length === 0 || selectedCount === allSlotKeys.length;
                    const unselectAllDisabled = selectedCount === 0;
                    const toolbarBaseClass =
                      "text-xs sm:text-sm h-8 px-3.5 rounded-lg font-medium disabled:opacity-40 transition-colors";
                    return (
                      <>
                        <div className="min-w-[150px] flex items-center justify-start">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={selectAllDisabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPressedToolbarBtn("selectAll");
                              handleSelectAllSlots();
                            }}
                            onMouseLeave={() => setPressedToolbarBtn(null)}
                            className={cn(
                              toolbarBaseClass,
                              "bg-card text-foreground border-border",
                              !selectAllDisabled && pressedToolbarBtn !== "selectAll"
                                ? "hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                                : "hover:bg-card hover:text-foreground hover:border-border"
                            )}
                          >
                            {t.selectAll}
                          </Button>
                        </div>

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

                        <div className="min-w-[150px] flex items-center justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={unselectAllDisabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPressedToolbarBtn("unselectAll");
                              setSelectedSlotKeys((prev) => {
                                const next = new Set(prev);
                                allSlotKeys.forEach((k) => next.delete(k));
                                return next;
                              });
                            }}
                            onMouseLeave={() => setPressedToolbarBtn(null)}
                            className={cn(
                              toolbarBaseClass,
                              "bg-card text-destructive border-destructive/40",
                              !unselectAllDisabled && pressedToolbarBtn !== "unselectAll"
                                ? "hover:bg-destructive hover:text-white hover:border-destructive"
                                : "hover:bg-card hover:text-destructive hover:border-destructive/40"
                            )}
                          >
                            {t.unselectAll}
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Right Column: Settings Card + Repetition Card (stationary on desktop) */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-80 sm:w-96 md:w-[410px] flex-none"
              >
                <div className="sticky top-4 space-y-3.5">
                  <p className="text-base sm:text-[17px] font-medium text-foreground">{t.step2}</p>
                  {/* Settings Card for selected slot groups: Product, Duration, Participants, Conference, Details, Repetition */}
                  <div
                    className={cn(
                      "bg-card border p-4 sm:p-4.5 rounded-2xl shadow-sm space-y-3.5 transition-all",
                      selectedSlotKeys.size > 0
                        ? "border-primary/40 ring-1 ring-primary/20 opacity-100"
                        : "border-border/60 opacity-60 pointer-events-none"
                    )}
                  >
                    {/* Conference Link Section */}
                    <div className="pt-1 -mx-1 sm:-mx-1.5 space-y-2">
                      <Label
                        className={cn(
                          "text-sm sm:text-base font-semibold flex items-center gap-1.5 transition-colors",
                          selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                        )}
                      >
                        <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.conferenceLink}</span>
                      </Label>

                      <div className="relative flex items-center">
                        <input
                          type="url"
                          disabled={selectedSlotKeys.size === 0}
                          placeholder={t.conferenceLinkPlaceholder}
                          value={currentPanelSettings?.customConferenceLink || ""}
                          onChange={(e) => updateSelectedSlotsField("customConferenceLink", e.target.value)}
                          className={cn(
                            "w-full h-11 sm:h-12 min-h-[44px] pl-3.5 text-xs sm:text-sm rounded-xl border border-input bg-background outline-none transition-colors",
                            selectedSlotKeys.size === 0
                              ? "opacity-40 cursor-not-allowed border-border"
                              : "focus:border-primary focus:ring-2 focus:ring-primary/20",
                            currentPanelSettings?.customConferenceLink ? "pr-20" : "pr-3.5"
                          )}
                        />
                        {selectedSlotKeys.size > 0 && Boolean(currentPanelSettings?.customConferenceLink) && (
                          <div className="absolute right-1.5 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyConferenceLink(currentPanelSettings?.customConferenceLink || "")}
                              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                              title={language === "ru" ? "Копировать ссылку" : "Сілтемені көшіру"}
                            >
                              {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                updateSelectedSlotsField("customConferenceLink", "");
                                setCopiedLink(false);
                              }}
                              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                              title={language === "ru" ? "Удалить ссылку" : "Сілтемені жою"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Duration with orange asterisk: field first, then buttons to the right */}
                    <div className="space-y-2">
                      <Label
                        className={cn(
                          "text-sm sm:text-base font-semibold flex items-center gap-1.5 transition-colors",
                          selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                        )}
                      >
                        <Timer className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.lessonDuration}</span>
                      </Label>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={isDifferentDuration ? t.different : t.customValue}
                          disabled={selectedSlotKeys.size === 0}
                          value={isDifferentDuration ? "" : (currentPanelSettings?.customDuration || "")}
                          className={cn(
                            "h-11 min-h-[44px] text-xs sm:text-sm font-semibold w-20 sm:w-24 shrink-0 text-center rounded-lg border border-input bg-background outline-none transition-colors",
                            "focus:border-primary focus:ring-2 focus:ring-primary/20",
                            (isDifferentDuration || currentPanelSettings?.customDuration) && "border-primary font-semibold text-primary"
                          )}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            updateSelectedSlotsField("customDuration", val);
                            if (val && Number(val) > 0) {
                              updateSelectedSlotsField("slotDuration", Number(val));
                            } else if (!val) {
                              updateSelectedSlotsField("slotDuration", 0);
                            }
                          }}
                          onBlur={() => {
                            if (!currentPanelSettings?.customDuration && !currentPanelSettings?.slotDuration) {
                              updateSelectedSlotsField("slotDuration", 60);
                            }
                          }}
                        />
                        {[50, 60, 90].map((dur) => {
                          const isActive = !isDifferentDuration && currentPanelSettings?.slotDuration === dur && !currentPanelSettings?.customDuration;

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
                                "h-11 min-h-[44px] flex-1 px-1.5 sm:px-2 text-xs sm:text-sm transition-all rounded-lg",
                                isActive
                                   ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                   : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                              )}
                            >
                              <span className="whitespace-nowrap">{dur} {t.min}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Participants with orange asterisk: field first, then buttons to the right */}
                    <div className="space-y-2">
                      <Label
                        className={cn(
                          "text-sm sm:text-base font-semibold flex items-center gap-1.5 transition-colors",
                          selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                        )}
                      >
                        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.participants}</span>
                      </Label>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={isDifferentParticipants ? t.different : t.customValue}
                          disabled={selectedSlotKeys.size === 0}
                          value={isDifferentParticipants ? "" : (currentPanelSettings?.customParticipants || "")}
                          className={cn(
                            "h-11 min-h-[44px] text-xs sm:text-sm font-semibold w-20 sm:w-24 shrink-0 text-center rounded-lg border border-input bg-background outline-none transition-colors",
                            "focus:border-primary focus:ring-2 focus:ring-primary/20",
                            (isDifferentParticipants || currentPanelSettings?.customParticipants) && "border-primary font-semibold text-primary"
                          )}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            updateSelectedSlotsField("customParticipants", val);
                            if (val && Number(val) > 0) {
                              updateSelectedSlotsField("maxParticipants", Number(val));
                            }
                          }}
                        />
                        {[
                          { value: 1, label: "1" },
                          { value: 5, label: "5" },
                          { value: 10, label: "10" },
                          { value: 999999, label: "∞" },
                        ].map((preset) => {
                          const isActive = !isDifferentParticipants && currentPanelSettings?.maxParticipants === preset.value && !currentPanelSettings?.customParticipants;

                          return (
                            <Button
                              key={preset.value}
                              type="button"
                              disabled={selectedSlotKeys.size === 0}
                              variant={isActive ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                updateSelectedSlotsField("customParticipants", "");
                                updateSelectedSlotsField("maxParticipants", preset.value);
                              }}
                              className={cn(
                                "h-11 min-h-[44px] flex-1 px-1 sm:px-1.5 text-xs sm:text-sm transition-all rounded-lg",
                                isActive
                                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                  : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                              )}
                            >
                              <span className={preset.value === 999999 ? "text-base sm:text-lg font-bold leading-none select-none" : ""}>
                                {preset.label}
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Lesson Details */}
                    <div className="space-y-2 -mx-1 sm:-mx-1.5">
                      <Label
                        className={cn(
                          "text-sm sm:text-base font-semibold flex items-center gap-1.5 transition-colors",
                          selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                        )}
                      >
                        <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.details}</span>
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={selectedSlotKeys.size === 0}
                        onClick={() => setIsDetailsDialogOpen(true)}
                        className="w-full justify-between h-11 sm:h-12 min-h-[44px] px-4 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all rounded-xl shadow-xs"
                      >
                        <span
                          className={cn(
                            "text-xs sm:text-sm",
                            selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                          )}
                        >
                          {t.detailsHint}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Button>
                    </div>

                    {/* For Product */}
                    {products && products.length > 0 && (
                      <div className="space-y-1.5 -mx-1 sm:-mx-1.5">
                        <Label
                          className={cn(
                            "text-sm sm:text-base font-semibold flex items-center gap-1.5 transition-colors",
                            selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                          )}
                        >
                          <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span>{t.forProduct}</span>
                          {isDifferentProduct && (
                            <span className="text-[11px] text-muted-foreground font-normal italic">
                              ({t.different})
                            </span>
                          )}
                        </Label>
                        <ProductSwitcher
                          products={products}
                          selectedId={isDifferentProduct ? null : (currentPanelSettings?.productId || defaultProductId || products[0]?.id || null)}
                          onChange={(newProdId) => updateSelectedSlotsField("productId", newProdId)}
                          disabled={selectedSlotKeys.size === 0}
                          placeholder={isDifferentProduct ? t.different : undefined}
                          hideIcon
                          className="w-full justify-between h-11 sm:h-12 min-h-[44px] px-4 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all rounded-xl shadow-xs cursor-pointer text-xs sm:text-sm font-semibold"
                        />
                      </div>
                    )}

                    {/* Repetition: separated from the settings above */}
                    <div className="pt-3 border-t border-border/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="repeat-switch"
                          className={cn(
                            "text-sm sm:text-base font-semibold cursor-pointer flex items-center gap-1.5 transition-colors",
                            selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                          )}
                        >
                          <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span>{t.everyWeek}</span>
                          {isDifferentRepeat && (
                            <span className="text-[11px] text-muted-foreground font-normal italic">
                              ({t.different})
                            </span>
                          )}
                        </Label>
                        <Switch
                          id="repeat-switch"
                          checked={isDifferentRepeat ? false : Boolean(currentPanelSettings?.repeatWeekly)}
                          onCheckedChange={(checked) => {
                            setRepeatWeekly(checked);
                            updateSelectedSlotsField("repeatWeekly", checked);
                            if (checked && !currentPanelSettings?.repeatPeriod) {
                              updateSelectedSlotsField("repeatPeriod", "1week");
                            }
                          }}
                        />
                      </div>

                      {(Boolean(currentPanelSettings?.repeatWeekly) || (isDifferentRepeat && repeatWeekly)) && (
                        <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-3.5 animate-in fade-in zoom-in-95">

                          {/* Repeat period buttons */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs sm:text-sm font-semibold text-foreground">
                                {t.repeatPeriodLabel}
                              </Label>
                              {isDifferentPeriod && (
                                <span className="text-[11px] text-muted-foreground font-normal italic">
                                  ({t.different})
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {(["1week", "2weeks", "1month", "custom"] as const).map((period) => {
                                const activePeriod = currentPanelSettings?.repeatPeriod || "1week";
                                const isSelected = !isDifferentPeriod && activePeriod === period;
                                return (
                                  <Button
                                    key={period}
                                    type="button"
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                      setRepeatPeriod(period);
                                      updateSelectedSlotsField("repeatPeriod", period);
                                      if (period === "custom") {
                                        const currentUntil = currentPanelSettings?.repeatUntil;
                                        if (currentUntil) {
                                          const parts = currentUntil.split("-");
                                          if (parts.length === 3) {
                                            setRepeatYear(parts[0]);
                                            setRepeatMonth(parts[1]);
                                            setRepeatDay(parts[2]);
                                          }
                                          setRepeatUntil(currentUntil);
                                        } else {
                                          setRepeatYear("");
                                          setRepeatMonth("");
                                          setRepeatDay("");
                                          setRepeatUntil("");
                                        }
                                        setIsCustomRepeatDialogOpen(true);
                                      }
                                    }}
                                    className={cn(
                                      "h-11 min-h-[44px] text-xs sm:text-sm font-semibold rounded-lg transition-all",
                                      isSelected
                                        ? "bg-primary text-primary-foreground font-semibold"
                                        : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                                    )}
                                  >
                                    {period === "1week"
                                      ? t.oneWeek
                                      : period === "1month"
                                      ? t.oneMonth
                                      : period === "2weeks"
                                      ? t.twoWeeks
                                      : t.custom}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>

                          {currentPanelSettings?.repeatPeriod === "custom" && (
                            <div className="pt-0.5">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const currentUntil = currentPanelSettings?.repeatUntil;
                                  if (currentUntil) {
                                    const parts = currentUntil.split("-");
                                    if (parts.length === 3) {
                                      setRepeatYear(parts[0]);
                                      setRepeatMonth(parts[1]);
                                      setRepeatDay(parts[2]);
                                    }
                                    setRepeatUntil(currentUntil);
                                  } else {
                                    setRepeatYear("");
                                    setRepeatMonth("");
                                    setRepeatDay("");
                                    setRepeatUntil("");
                                  }
                                  setIsCustomRepeatDialogOpen(true);
                                }}
                                className="w-full justify-between h-11 min-h-[44px] px-3.5 border-primary/40 bg-background text-xs sm:text-sm font-medium hover:bg-primary/10 transition-all rounded-lg"
                              >
                                <span className="truncate font-semibold text-foreground">
                                  {currentPanelSettings?.repeatUntil
                                    ? `${language === "ru" ? "До: " : "Дейін: "}${format(parseISO(currentPanelSettings.repeatUntil), "d MMMM yyyy", { locale: language === "ru" ? ru : kk })}`
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
            </div>
            </>
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
                    updateSelectedSlotsField("repeatUntil", isoStr);
                    updateSelectedSlotsField("repeatPeriod", "custom");
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

        {/* Lesson Details Dialog - hidden while cropping to prevent overlapping */}
        <Dialog open={isDetailsDialogOpen && !coverCrop.source} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent hideCloseButton className="max-w-lg sm:max-w-xl w-full p-5 sm:p-6 rounded-2xl bg-card border border-border">
            <VisuallyHidden>
              <DialogTitle>{t.details}</DialogTitle>
            </VisuallyHidden>

            <div className="space-y-3.5">
              {/* 1. Cover Area (Photos only, with cropper when selecting) */}
              <div className="space-y-1.5">
                <Label className="text-sm sm:text-base font-semibold text-foreground">
                  {t.cover}
                </Label>

                {currentPanelSettings?.imageUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-border h-40 sm:h-44 w-full bg-muted/30 group">
                    <img
                      src={currentPanelSettings.imageUrl}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                    {/* Hover overlay with Pencil and text in the center like on profile photo */}
                    <label
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 text-white cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2 bg-black/40 hover:bg-black/60 px-3.5 py-2 rounded-xl backdrop-blur-xs transition-colors shadow-sm">
                        <Pencil className="w-4 h-4 text-white shrink-0" />
                        <span className="text-xs sm:text-sm font-medium">
                          {language === "ru" ? "Поменять обложку" : "Мұқабаны ауыстыру"}
                        </span>
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
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {/* Trash in bottom-right corner */}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute bottom-2 right-2 h-8 w-8 rounded-lg shadow-md z-10"
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
                        e.target.value = "";
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

        {/* Cover cropping as a nested Radix Dialog (portal-based overlay would be blocked by the open wizard Dialog's pointer-events: none) */}
        <Dialog
          open={Boolean(coverCrop.source)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !cropSaving) coverCrop.resetCrop();
          }}
        >
          <DialogContent
            hideCloseButton
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            className="w-[calc(100%-1.5rem)] max-w-lg sm:max-w-xl rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3 pb-1 border-b border-border/50">
              <DialogTitle className="text-base sm:text-lg font-semibold text-foreground">
                {language === "ru" ? "Настройка обложки" : "Мұқабаны баптау"}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 min-h-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => {
                  if (!cropSaving) coverCrop.resetCrop();
                }}
                title={language === "kk" ? "Өзгерістер сақталмайды" : "Изменения не сохранятся"}
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Line around showing settings are inside cover */}
            <div className="p-3 sm:p-4 rounded-2xl border-2 border-primary/30 bg-muted/10 space-y-3">
              {coverCrop.source && (
                <CoverCropEditor
                  source={coverCrop.source}
                  mediaType={coverCrop.mediaType}
                  previewStyle={coverCrop.previewStyle}
                  zoom={coverCrop.zoom}
                  onZoom={coverCrop.setZoom}
                  onPointerDown={coverCrop.onPointerDown}
                  onPointerMove={coverCrop.onPointerMove}
                  onPointerUp={coverCrop.onPointerUp}
                  saving={cropSaving}
                  hideCancel
                  onCancel={() => {
                    coverCrop.resetCrop();
                  }}
                  onSave={() => void handleSaveCrop()}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Mobile bottom container: step panel ("Выбранное время" / "Параметры") + step switcher */}
        <div ref={mobileBottomBarRef} className="flex sm:hidden fixed bottom-0 left-0 right-0 z-30 flex-col">
          {step === 1 && (
            <div className="bg-card border-t border-border/80 p-3 px-4 shadow-lg space-y-2">
              <button
                type="button"
                onClick={() => setIsMobileTimesExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2 cursor-pointer"
                aria-expanded={isMobileTimesExpanded}
              >
                <span className="text-base font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  {t.repeatSummary}
                </span>
                <ChevronUp
                  className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", isMobileTimesExpanded && "rotate-180")}
                />
              </button>
              {isMobileTimesExpanded &&
                (editableDaysOnDesktop.length > 0 ? (
                  <AlwaysScrollArea viewportClassName="max-h-[calc(100dvh-200px)] pr-3">
                    <div className="space-y-2 pb-1">{renderTimesByDay()}</div>
                  </AlwaysScrollArea>
                ) : (
                  <div className="h-9 flex items-center text-xs text-muted-foreground">{t.noSlotsWarning}</div>
                ))}
            </div>
          )}

          {step === 2 && (
            <div className="bg-card border-t border-border/80 p-3 px-4 shadow-lg space-y-2">
              <button
                type="button"
                onClick={() => setIsMobileParamsExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2 cursor-pointer"
                aria-expanded={isMobileParamsExpanded}
              >
                <span className="text-base font-semibold text-foreground flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-primary" />
                  {t.step2}
                </span>
                <ChevronUp
                  className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", isMobileParamsExpanded && "rotate-180")}
                />
              </button>
              {isMobileParamsExpanded && (
                <AlwaysScrollArea viewportClassName="max-h-[calc(100dvh-200px)] pr-3">
                  <div
                    className={cn(
                      "space-y-4 pt-1 pb-1 transition-opacity",
                      selectedSlotKeys.size > 0 ? "opacity-100" : "opacity-60 pointer-events-none"
                    )}
                  >
                  {/* Conference Link Section */}
                  <div className="pt-1 space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.conferenceLink}</span>
                    </Label>

                    <div className="relative flex items-center">
                      <input
                        type="url"
                        placeholder={t.conferenceLinkPlaceholder}
                        value={currentPanelSettings?.customConferenceLink || ""}
                        onChange={(e) => updateSelectedSlotsField("customConferenceLink", e.target.value)}
                        className={cn(
                          "w-full h-11 min-h-[44px] pl-3.5 text-xs rounded-xl border border-input bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors",
                          currentPanelSettings?.customConferenceLink ? "pr-20" : "pr-3.5"
                        )}
                      />
                      {Boolean(currentPanelSettings?.customConferenceLink) && (
                        <div className="absolute right-1.5 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyConferenceLink(currentPanelSettings?.customConferenceLink || "")}
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            title={language === "ru" ? "Копировать ссылку" : "Сілтемені көшіру"}
                          >
                            {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedSlotsField("customConferenceLink", "");
                              setCopiedLink(false);
                            }}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            title={language === "ru" ? "Удалить ссылку" : "Сілтемені жою"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lesson Duration */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <Timer className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.lessonDuration}</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={isDifferentDuration ? t.different : t.customValue}
                        value={isDifferentDuration ? "" : currentPanelSettings?.customDuration || ""}
                        className={cn(
                          "h-11 min-h-[44px] text-xs font-semibold w-20 shrink-0 text-center rounded-lg border border-input bg-background outline-none transition-colors",
                          "focus:border-primary focus:ring-2 focus:ring-primary/20",
                          (isDifferentDuration || currentPanelSettings?.customDuration) &&
                            "border-primary font-semibold text-primary"
                        )}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          updateSelectedSlotsField("customDuration", val);
                          if (val && Number(val) > 0) {
                            updateSelectedSlotsField("slotDuration", Number(val));
                          } else if (!val) {
                            updateSelectedSlotsField("slotDuration", 0);
                          }
                        }}
                        onBlur={() => {
                          if (!currentPanelSettings?.customDuration && !currentPanelSettings?.slotDuration) {
                            updateSelectedSlotsField("slotDuration", 60);
                          }
                        }}
                      />
                      {[50, 60, 90].map((dur) => {
                        const isActive =
                          !isDifferentDuration &&
                          currentPanelSettings?.slotDuration === dur &&
                          !currentPanelSettings?.customDuration;
                        return (
                          <Button
                            key={dur}
                            type="button"
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              updateSelectedSlotsField("customDuration", "");
                              updateSelectedSlotsField("slotDuration", dur);
                            }}
                            className={cn(
                              "h-11 min-h-[44px] flex-1 px-1.5 text-xs transition-all rounded-lg",
                              isActive
                                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                            )}
                          >
                            <span className="whitespace-nowrap">
                              {dur} {t.min}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Max Participants */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.participants}</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={isDifferentParticipants ? t.different : t.customValue}
                        value={
                          isDifferentParticipants ? "" : currentPanelSettings?.customParticipants || ""
                        }
                        className={cn(
                          "h-11 min-h-[44px] text-xs font-semibold w-20 shrink-0 text-center rounded-lg border border-input bg-background outline-none transition-colors",
                          "focus:border-primary focus:ring-2 focus:ring-primary/20",
                          (isDifferentParticipants || currentPanelSettings?.customParticipants) &&
                            "border-primary font-semibold text-primary"
                        )}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          updateSelectedSlotsField("customParticipants", val);
                          if (val && Number(val) > 0) {
                            updateSelectedSlotsField("maxParticipants", Number(val));
                          }
                        }}
                      />
                      {[
                        { value: 1, label: "1" },
                        { value: 5, label: "5" },
                        { value: 10, label: "10" },
                        { value: 999999, label: "∞" },
                      ].map((preset) => {
                        const isActive =
                          !isDifferentParticipants &&
                          currentPanelSettings?.maxParticipants === preset.value &&
                          !currentPanelSettings?.customParticipants;
                        return (
                          <Button
                            key={preset.value}
                            type="button"
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              updateSelectedSlotsField("customParticipants", "");
                              updateSelectedSlotsField("maxParticipants", preset.value);
                            }}
                            className={cn(
                              "h-11 min-h-[44px] flex-1 px-1 text-xs transition-all rounded-lg",
                              isActive
                                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                                : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                            )}
                          >
                            <span className={preset.value === 999999 ? "text-base sm:text-lg font-bold leading-none select-none" : ""}>
                              {preset.label}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Lesson Details */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.details}</span>
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDetailsDialogOpen(true)}
                      className="w-full justify-between h-11 min-h-[44px] px-4 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all rounded-xl shadow-xs cursor-pointer"
                    >
                      <span className="text-xs text-foreground">{t.detailsHint}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Button>
                  </div>

                  {/* For Product */}
                  {products && products.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.forProduct}</span>
                        {isDifferentProduct && (
                          <span className="text-[11px] text-muted-foreground font-normal italic">
                            ({t.different})
                          </span>
                        )}
                      </Label>
                      <ProductSwitcher
                        products={products}
                        selectedId={isDifferentProduct ? null : (currentPanelSettings?.productId || defaultProductId || products[0]?.id || null)}
                        onChange={(newProdId) => updateSelectedSlotsField("productId", newProdId)}
                        placeholder={isDifferentProduct ? t.different : undefined}
                        hideIcon
                        className="w-full justify-between h-11 min-h-[44px] px-3.5 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all rounded-xl shadow-xs cursor-pointer text-xs font-semibold"
                      />
                    </div>
                  )}

                  {/* Repetition: separated from the settings above */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="mobile-repeat-switch"
                        className="text-sm font-semibold cursor-pointer flex items-center gap-1.5 text-foreground"
                      >
                        <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.everyWeek}</span>
                        {isDifferentRepeat && (
                          <span className="text-[11px] text-muted-foreground font-normal italic">
                            ({t.different})
                          </span>
                        )}
                      </Label>
                      <Switch
                        id="mobile-repeat-switch"
                        checked={isDifferentRepeat ? false : Boolean(currentPanelSettings?.repeatWeekly)}
                        onCheckedChange={(checked) => {
                          setRepeatWeekly(checked);
                          updateSelectedSlotsField("repeatWeekly", checked);
                          if (checked && !currentPanelSettings?.repeatPeriod) {
                            updateSelectedSlotsField("repeatPeriod", "1week");
                          }
                        }}
                      />
                    </div>

                    {(Boolean(currentPanelSettings?.repeatWeekly) || (isDifferentRepeat && repeatWeekly)) && (
                      <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-3 animate-in fade-in zoom-in-95">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-foreground">
                            {t.repeatPeriodLabel}
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            {(["1week", "2weeks", "1month", "custom"] as const).map((period) => {
                              const activePeriod = currentPanelSettings?.repeatPeriod || "1week";
                              const isSelected = !isDifferentPeriod && activePeriod === period;
                              return (
                                <Button
                                  key={period}
                                  type="button"
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    setRepeatPeriod(period);
                                    updateSelectedSlotsField("repeatPeriod", period);
                                    if (period === "custom") {
                                      const currentUntil = currentPanelSettings?.repeatUntil;
                                      if (currentUntil) {
                                        const parts = currentUntil.split("-");
                                        if (parts.length === 3) {
                                          setRepeatYear(parts[0]);
                                          setRepeatMonth(parts[1]);
                                          setRepeatDay(parts[2]);
                                        }
                                        setRepeatUntil(currentUntil);
                                      } else {
                                        setRepeatYear("");
                                        setRepeatMonth("");
                                        setRepeatDay("");
                                        setRepeatUntil("");
                                      }
                                      setIsCustomRepeatDialogOpen(true);
                                    }
                                  }}
                                  className={cn(
                                    "h-11 min-h-[44px] text-xs font-semibold rounded-lg transition-all",
                                    isSelected
                                      ? "bg-primary text-primary-foreground font-semibold"
                                      : "border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                                  )}
                                >
                                  {period === "1week"
                                    ? t.oneWeek
                                    : period === "1month"
                                    ? t.oneMonth
                                    : period === "2weeks"
                                    ? t.twoWeeks
                                    : t.custom}
                                </Button>
                              );
                            })}
                          </div>
                        </div>

                        {currentPanelSettings?.repeatPeriod === "custom" && (
                          <div className="pt-0.5">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const currentUntil = currentPanelSettings?.repeatUntil;
                                if (currentUntil) {
                                  const parts = currentUntil.split("-");
                                  if (parts.length === 3) {
                                    setRepeatYear(parts[0]);
                                    setRepeatMonth(parts[1]);
                                    setRepeatDay(parts[2]);
                                  }
                                  setRepeatUntil(currentUntil);
                                } else {
                                  setRepeatYear("");
                                  setRepeatMonth("");
                                  setRepeatDay("");
                                  setRepeatUntil("");
                                }
                                setIsCustomRepeatDialogOpen(true);
                              }}
                              className="w-full justify-between h-11 min-h-[44px] px-3.5 border-primary/40 bg-background text-xs font-medium hover:bg-primary/10 transition-all rounded-lg cursor-pointer"
                            >
                              <span className="truncate font-semibold text-foreground">
                                {currentPanelSettings?.repeatUntil
                                  ? `${language === "ru" ? "До: " : "Дейін: "}${format(parseISO(currentPanelSettings.repeatUntil), "d MMMM yyyy", { locale: language === "ru" ? ru : kk })}`
                                  : language === "ru"
                                  ? "Выберите дату окончания"
                                  : "Аяқталу күнін таңдаңыз"}
                              </span>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                </AlwaysScrollArea>
              )}
            </div>
          )}

          <div className="flex items-center justify-center py-2.5 px-4 border-t bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            {renderStepSwitcher()}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
