import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, ChevronDown, ChevronLeft, ChevronRight, Trash2, Check, MapPin, Plus, X, Pencil, Calendar as CalendarIcon, Timer, Users, Package, Video, Loader2, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { format, addDays, startOfWeek, isSameDay, parseISO, isValid, differenceInCalendarWeeks } from "date-fns";
import { ru, kk } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import CoverCropEditor from "@/components/creator/CoverCropEditor";
import { useCoverCrop } from "@/hooks/useCoverCrop";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import AccountSettingsDialog, { openAccountSettings } from "@/components/account/AccountSettingsDialog";
import { useTimezone } from "@/contexts/TimezoneContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import ProductSwitcher from "@/components/creator/ProductSwitcher";
import { invokeApi, sessionCreds } from "@/lib/sessionApi";

const ReqStar = ({ className }: { className?: string }) => (
  <span className={cn("text-primary font-bold ml-1 text-sm sm:text-base inline-block -translate-y-0.5 select-none leading-none transition-colors", className)} aria-hidden="true">
    *
  </span>
);

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
  repeatPeriod?: "1week" | "1month" | "2months" | "custom" | null;
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
        repeatPeriod?: "1week" | "1month" | "2months" | "custom" | null;
        repeatUntil?: string | null;
      }[]
    >;
    timeIntervals: { start: string; end: string }[];
    repeatDays: number[];
    repeatWeekly: boolean;
    repeatPeriod: "1week" | "1month" | "2months" | "custom" | null;
    repeatUntil: string | null;
    slotDuration: number;
    maxParticipants: number;
    productId?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    location?: string;
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
  onChange: (t: string) => boolean | void;
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

  // Smoothly center selected items inside the container without scrolling parent dialogs
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (hoursContainerRef.current) {
          const hourEl = hoursContainerRef.current.querySelector<HTMLElement>('[data-selected="true"]');
          if (hourEl) {
            const container = hoursContainerRef.current;
            container.scrollTop = hourEl.offsetTop - container.clientHeight / 2 + hourEl.clientHeight / 2;
          }
        }
        if (minutesContainerRef.current) {
          const minEl = minutesContainerRef.current.querySelector<HTMLElement>('[data-selected="true"]');
          if (minEl) {
            const container = minutesContainerRef.current;
            container.scrollTop = minEl.offsetTop - container.clientHeight / 2 + minEl.clientHeight / 2;
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
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
          className="inline-flex items-center justify-center h-6.5 sm:h-7 w-[58px] sm:w-[62px] bg-background/90 hover:bg-background border border-border/80 hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-md px-1 font-mono text-[13px] sm:text-sm font-semibold text-foreground transition-colors cursor-pointer select-none"
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hoursRef.current) {
        const hourEl = hoursRef.current.querySelector<HTMLElement>('[data-selected="true"]');
        if (hourEl) {
          hoursRef.current.scrollTop = hourEl.offsetTop - hoursRef.current.clientHeight / 2 + hourEl.clientHeight / 2;
        }
      }
      if (minutesRef.current) {
        const minEl = minutesRef.current.querySelector<HTMLElement>('[data-selected="true"]');
        if (minEl) {
          minutesRef.current.scrollTop = minEl.offsetTop - minutesRef.current.clientHeight / 2 + minEl.clientHeight / 2;
        }
      }
    }, 50);
    return () => clearTimeout(timer);
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
          className="w-full h-8 text-xs font-semibold cursor-pointer"
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
  const { timezone, userCity, convertSlotToUser, convertUserToSlot } = useTimezone();
  const { user, profileType, profiles } = useSimpleAuth();
  const [isTimezoneSettingsOpen, setIsTimezoneSettingsOpen] = useState(false);

  const primaryCity =
    userCity ||
    (typeof window !== "undefined" ? localStorage.getItem("app_user_city") : null) ||
    (language === "kk" && timezone.cityKk ? timezone.cityKk : timezone.city)
      .split(",")[0]
      .trim();
  const gmtLabel = timezone.offsetLabel.replace("UTC", "GMT");

  const activeProfileId = typeof window !== "undefined" ? localStorage.getItem("profile_id") : null;
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("simple_user_id") || "" : "";
  const creatorName = typeof window !== "undefined" ? localStorage.getItem("creator_name") : null;
  const teacherData = typeof window !== "undefined" ? localStorage.getItem("teacher_data") : null;
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const shownName = activeProfile?.displayName?.trim() || user?.name || creatorName || (teacherData ? "Учитель" : "—");
  const effectiveUserId = user?.id || currentUserId || creatorName || "";
  const effectiveRole = (profileType || (teacherData ? "teacher" : "creator")) as "buyer" | "creator" | "school" | "teacher";

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showLateHours, setShowLateHours] = useState(false);
  const [workingHours, setWorkingHours] = useState(() => {
    const isMob = typeof window !== "undefined" && window.innerWidth < 640;
    return { start: "09:00", end: isMob ? "17:30" : "21:00" };
  });
  const [tempWorkingHours, setTempWorkingHours] = useState(() => {
    const isMob = typeof window !== "undefined" && window.innerWidth < 640;
    return { start: "09:00", end: isMob ? "17:30" : "21:00" };
  });
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [isMobileRangeOpen, setIsMobileRangeOpen] = useState(false);
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
  const [isGeneratingMeet, setIsGeneratingMeet] = useState(false);

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

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  const isMobile = useIsMobile();
  const [mobileDayIdx, setMobileDayIdx] = useState<number>(() => {
    const dow = (new Date().getDay() + 6) % 7;
    return dow >= 0 && dow < 7 ? dow : 0;
  });

  useEffect(() => {
    if (isMobile && (workingHours.end === "21:00" || workingHours.end === "18:00") && !showLateHours) {
      setWorkingHours({ start: "09:00", end: "17:30" });
      setTempWorkingHours({ start: "09:00", end: "17:30" });
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
      const defaultEnd = isMob ? "17:30" : "21:00";
      setWorkingHours({ start: "09:00", end: defaultEnd });
      setTempWorkingHours({ start: "09:00", end: defaultEnd });
      setIsRangeOpen(false);
      setIsMobileRangeOpen(false);
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
  }, [open, existingSlots, realCurrentWeekStart, initialWeekStart, getInitialCellsForDates]);

  useEffect(() => {
    const up = () => setIsMouseDown(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const dict = {
    ru: {
      wizTitleStep1: "Создание, перенос и удаление",
      wizTitleStep2: "Настройки параметров",
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
      twoMonths: "2 месяца",
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
      repeatSummary: "Интервалы слотов",
      selectAll: "Выбрать все слоты",
      unselectAll: "Снять выбор",
      different: "Разные",
      forProduct: "Относится к продукту",
      conferenceLink: "Ссылка на конференцию",
      googleMeetOption: "Google Meet",
      googleMeetAuto: "Ссылка создаётся автоматически",
      addMeetLink: "Добавить видеоконференцию",
      customLinkOption: "Другая ссылка:",
      customLinkPlaceholder: "Zoom, Яндекс телемост…",
      generatingMeet: "Создаём ссылку…",
    },
    kk: {
      wizTitleStep1: "Жасау, ауыстыру және жою",
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
      twoMonths: "2 ай",
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
      repeatSummary: "Слот аралықтары",
      selectAll: "Барлық слоттарды таңдау",
      unselectAll: "Таңдауды алып тастау",
      different: "Әртүрлі",
      forProduct: "Өнімге қатысты",
      conferenceLink: "Конференцияға сілтеме",
      googleMeetOption: "Google Meet",
      googleMeetAuto: "Сілтеме автоматты түрде жасалады",
      addMeetLink: "Бейнеконференция қосу",
      customLinkOption: "Басқа сілтеме:",
      customLinkPlaceholder: "Zoom, Яндекс телемост…",
      generatingMeet: "Сілтемені жасап жатырмыз…",
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
  const createDefaultSlotSettings = (initialProductId?: string): SlotSettings => ({
    slotDuration: 60,
    maxParticipants: 1,
    productId: initialProductId || defaultProductId || products[0]?.id || "",
    title: "",
    description: "",
    imageUrl: "",
    location: "",
    repeatWeekly: false,
    repeatPeriod: "1week",
    repeatUntil: null,
  });

  // When switching to step 2: auto-select new slots!
  const handleStepChange = (newStep: 1 | 2) => {
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
            copy[k] = createDefaultSlotSettings(existing?.product_id);
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
        [key]: createDefaultSlotSettings(existing?.product_id),
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

  const generateGoogleMeetLink = async () => {
    setIsGeneratingMeet(true);
    try {
      const creds = sessionCreds();
      const result = await invokeApi<{ meetLink: string }>("manage-schedules", {
        action: "create_google_meet_link",
        title: "Урок",
        ...creds,
      });
      if (result.meetLink) {
        updateSelectedSlotsField("conferenceType", "google_meet");
        updateSelectedSlotsField("googleMeetLink", result.meetLink);
      } else {
        toast.error(language === "ru" ? "Не удалось создать ссылку Google Meet" : "Google Meet сілтемесін жасау мүмкін болмады");
      }
    } catch {
      toast.error(language === "ru" ? "Не удалось создать ссылку Google Meet" : "Google Meet сілтемесін жасау мүмкін болмады");
    } finally {
      setIsGeneratingMeet(false);
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
      return createDefaultSlotSettings(existing?.product_id);
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
    return createDefaultSlotSettings(existing?.product_id);
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
        repeatPeriod?: "1week" | "1month" | "2months" | "custom" | null;
        repeatUntil?: string | null;
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
        const settings = slotSettingsMap[key] || createDefaultSlotSettings(existing?.product_id);
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
      deletedSlotIds,
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
                    ? isSelected
                      ? "bg-primary/50 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] cursor-not-allowed border-t border-white/50 opacity-80"
                      : "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] cursor-not-allowed opacity-80"
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
      <div key={`${isLate ? "late_" : ""}${h}`} className="grid grid-cols-[100px_repeat(7,1fr)] relative">
        <div className="relative border-r border-border/60 select-none">
          {!isFirstLateHour && (
            <span className="absolute top-0 -translate-y-1/2 right-3 text-xs sm:text-[13px] font-mono font-medium text-foreground/80">
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
                      ? isSelected
                        ? "bg-primary/50 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] cursor-not-allowed border-t border-white/50 opacity-80"
                        : "bg-muted/60 [background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.12)_5px,rgba(0,0,0,0.12)_10px)] dark:[background-image:repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.12)_5px,rgba(255,255,255,0.12)_10px)] cursor-not-allowed opacity-80"
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

  const lateMaxHeight = lateHoursArr.length * 2 * 24 + 32;

  const currentDayIntervals = effectiveIntervalsByDay[mobileDayIdx] || [];
  const totalIntervalsCount = Object.values(effectiveIntervalsByDay).flat().length;

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
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-foreground whitespace-normal leading-tight">
              {step === 1 ? t.wizTitleStep1 : t.wizTitleStep2}
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
                disabled={editableDaysOnDesktop.length === 0}
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
                    {isCurrentDayToday && (
                      <span className="px-1.5 py-0.2 text-[9.5px] font-semibold bg-primary/15 text-primary rounded-full shrink-0 mt-0.5">
                        {language === "ru" ? "Сегодня" : "Бүгін"}
                      </span>
                    )}
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
                    <div className="py-1 px-2 text-center flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => setIsTimezoneSettingsOpen(true)}
                        className="text-xs font-semibold text-foreground hover:text-primary flex items-center justify-center gap-1.5 cursor-pointer py-1 px-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <span>🌍 {primaryCity} ({gmtLabel})</span>
                        <span className="text-[9px] text-muted-foreground">▼</span>
                      </button>
                    </div>
                  </div>

                  {/* Top spacer matching bottom padding so 09:00 doesn't collide with header */}
                  <div className="grid grid-cols-[64px_1fr] select-none pointer-events-none">
                    <div className="border-r border-border/60 h-3 bg-muted/20" />
                    <div className="h-3" />
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
                            : "border-foreground/35"
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Mobile Toolbar under grid */}
                <div className="flex items-center justify-between gap-2 mt-3 mb-2 px-0.5">
                  {/* Left: Time range */}
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
                          "hover:bg-primary hover:text-white hover:border-primary active:bg-primary active:text-white",
                          isMobileRangeOpen && "bg-primary text-white border-primary"
                        )}
                        title={t.timeRangeBtn}
                      >
                        <Clock className={cn("w-3.5 h-3.5 text-foreground transition-colors group-hover:text-white group-active:text-white", isMobileRangeOpen && "text-white")} />
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

                  {/* Center: Late hours toggle */}
                  {lateHoursArr.length > 0 && (
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
                  )}

                  {/* Right: Clear all with popover */}
                  {activeDays.length > 0 && (
                    <Popover open={isConfirmClearOpen} onOpenChange={setIsConfirmClearOpen}>
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
                      <PopoverContent className="w-64 p-3 text-center space-y-2.5 shadow-lg" align="end">
                        <p className="text-xs font-medium text-foreground">
                          {weekOffset === 0 ? t.confirmClearRemainingTitle : t.confirmClearAllTitle}
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs"
                            onClick={() => setIsConfirmClearOpen(false)}
                          >
                            {t.no}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-3 text-xs"
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

              {/* DESKTOP STEP 1: 7-day grid */}
              <div className="hidden sm:flex gap-5 p-2 sm:p-4 min-w-[750px]">
              {/* Left: Schedule grid */}
              <div className="flex-1 min-w-0">
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card select-none">
                  {/* Grid header with days */}
                  <div className="grid grid-cols-[100px_repeat(7,1fr)] bg-muted/50 border-b border-border sticky top-0 z-10">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTimezoneSettingsOpen(true);
                      }}
                      className="py-1.5 px-1.5 text-center font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 border-r border-border/60 flex flex-col items-center justify-center gap-1 transition-colors group cursor-pointer"
                      title={
                        language === "ru"
                          ? "Нажмите для изменения"
                          : "Өзгерту үшін басыңыз"
                      }
                    >
                      <span className="text-[11.5px] sm:text-[12.5px] font-semibold leading-tight text-foreground flex items-center justify-center gap-1 text-center px-0.5 whitespace-nowrap">
                        <span className="text-xs sm:text-sm">🌍</span> {primaryCity}
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-medium leading-none text-muted-foreground group-hover:text-foreground flex items-center gap-0.5 whitespace-nowrap">
                        ({gmtLabel}) <span className="text-[8.5px] leading-none">▼</span>
                      </span>
                    </button>
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
                          {idx === 0 && weekOffset > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                changeWeek(weekOffset - 1);
                              }}
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-muted border border-border/80 hover:border-primary/50 flex items-center justify-center text-foreground/80 hover:text-primary transition-all z-20 cursor-pointer shadow-xs"
                              title="Предыдущая неделя"
                            >
                              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          )}
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
                          {idx === 6 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                changeWeek(weekOffset + 1);
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-muted border border-border/80 hover:border-primary/50 flex items-center justify-center text-foreground/80 hover:text-primary transition-all z-20 cursor-pointer shadow-xs"
                              title="Следующая неделя"
                            >
                              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Spacer */}
                  <div className="grid grid-cols-[100px_repeat(7,1fr)] bg-muted/10">
                    <div className="border-r border-border/60 h-2 sm:h-2.5" />
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="border-r last:border-r-0 border-foreground/35 h-2 sm:h-2.5" />
                    ))}
                  </div>

                  {/* Hours rows */}
                  <div className="bg-card">
                    {baseHours.map((h) => renderHourRow(h, false))}

                    {/* Stationary boundary label (e.g. 21:00) */}
                    <div className="relative grid grid-cols-[100px_repeat(7,1fr)] select-none pointer-events-none">
                      <div className="relative border-r border-border/60 h-0">
                        {!workingHours.end.endsWith(":30") && (
                          <span className="absolute top-0 -translate-y-1/2 right-3 text-xs sm:text-[13px] font-mono font-medium text-foreground/80">
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
                    <div className="grid grid-cols-[100px_repeat(7,1fr)] relative">
                      <div className="relative border-r border-border/60 h-3 select-none">
                        {showLateHours && lateHoursArr.length > 0 && (
                          <span className="absolute top-0 -translate-y-1/2 right-3 text-xs sm:text-[13px] font-mono font-medium text-foreground/80">
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
                              : "border-t-foreground/35"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom toolbar under grid */}
                <div className="flex items-center justify-between mt-3 mb-2 px-1">
                  {/* Left: Time range */}
                  <div className="flex justify-start shrink-0">
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
                            "text-xs h-8 gap-1.5 rounded-md px-3 font-medium border-border text-foreground bg-card hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-sm transition-colors group cursor-pointer",
                            isRangeOpen && "bg-primary text-primary-foreground border-primary"
                          )}
                        >
                          <Clock className={cn("w-3.5 h-3.5 text-muted-foreground group-hover:text-primary-foreground transition-colors", isRangeOpen && "text-primary-foreground")} />
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
                  <div className="min-w-[150px] flex justify-end shrink-0">
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
                        <PopoverContent className="w-64 p-3 text-center space-y-2.5 shadow-lg" align="end">
                          <p className="text-xs font-medium text-foreground">
                            {weekOffset === 0 ? t.confirmClearRemainingTitle : t.confirmClearAllTitle}
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 min-w-[48px] text-xs"
                              onClick={() => setIsConfirmClearOpen(false)}
                            >
                              {t.no}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-3 min-w-[48px] text-xs"
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
                      })
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
              {/* MOBILE STEP 2: Settings with sticky top slot summary */}
              <div className="block sm:hidden p-3.5 space-y-3.5 pb-28">
                {/* Summary of Selected Slots - Pinned at top and sticky */}
                <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md pt-0.5 pb-2 -mx-3.5 px-3.5 border-b border-border/40 shadow-2xs">
                  <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
                        {language === "ru" ? "Настраиваемые слоты:" : "Бапталатын слоттар:"}
                      </span>
                      {(() => {
                        const isAllSelected =
                          allSlotKeys.length > 0 && allSlotKeys.every((k) => selectedSlotKeys.has(k));
                        return (
                          <Button
                            type="button"
                            size="sm"
                            disabled={allSlotKeys.length === 0}
                            onClick={() => {
                              if (isAllSelected) {
                                setSelectedSlotKeys((prev) => {
                                  const next = new Set(prev);
                                  allSlotKeys.forEach((k) => next.delete(k));
                                  return next;
                                });
                              } else {
                                handleSelectAllSlots();
                              }
                            }}
                            className={cn(
                              "text-xs h-7 px-2.5 rounded-lg transition-colors border shadow-2xs font-medium cursor-pointer",
                              isAllSelected
                                ? "bg-card text-destructive border-destructive/40 hover:bg-destructive hover:text-white hover:border-destructive font-semibold"
                                : "bg-card text-foreground border-border hover:bg-primary hover:text-white hover:border-primary"
                            )}
                          >
                            {isAllSelected ? t.unselectAll : t.selectAll}
                          </Button>
                        );
                      })()}
                    </div>

                    {/* Slot keys as selectable vertical list - exactly 2 visible */}
                    {allSlotKeys.length === 0 ? (
                      <div className="h-[80px] flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-xl bg-card/50">
                        {t.noSlotsWarning}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 h-[80px] overflow-y-auto overscroll-contain touch-pan-y pr-2.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/35 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/55 [&::-webkit-scrollbar-track]:bg-muted/20 [&::-webkit-scrollbar-track]:rounded-full">
                        {allSlotKeys.map((key) => {
                          const isSelected = selectedSlotKeys.has(key);
                          const [dStr, start, end] = key.split("_");
                          const dateObj = parseISO(dStr);
                          const dayName = isValid(dateObj)
                            ? format(dateObj, "EEE, d MMM", { locale: language === "ru" ? ru : kk })
                            : dStr;

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleSlotSelection(key)}
                              className={cn(
                                "w-full h-9 px-3 rounded-xl text-sm font-medium transition-colors border shrink-0 flex items-center justify-center cursor-pointer truncate",
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                                  : "bg-muted/60 text-muted-foreground border-border hover:border-primary/40"
                              )}
                              title={`${dayName}: ${start}–${end}`}
                            >
                              <span className="truncate">
                                {dayName}: {start}–{end}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Settings Card: Duration, Participants, Details */}
                <div
                  className={cn(
                    "bg-card border p-4 rounded-2xl shadow-sm space-y-4 transition-all",
                    selectedSlotKeys.size > 0
                      ? "border-primary/40 ring-1 ring-primary/20 opacity-100"
                      : "border-border/60 opacity-60 pointer-events-none"
                  )}
                >
                  <div className="pb-1 border-b border-border/50">
                    <h3 className="text-sm font-semibold text-foreground">{t.slotParams}</h3>
                  </div>

                  {/* Lesson Duration */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Timer className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.lessonDuration}</span>
                      <ReqStar />
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
                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.participants}</span>
                      <ReqStar />
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

                  {/* For Product */}
                  {products && products.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.forProduct}</span>
                        <ReqStar />
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

                  {/* Conference Link Section */}
                  <div className="pt-1 space-y-2">
                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.conferenceLink}</span>
                    </Label>

                    {/* Two toggle buttons */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isGeneratingMeet}
                        onClick={() => {
                          if (currentPanelSettings?.conferenceType !== "google_meet") {
                            updateSelectedSlotsField("conferenceType", "google_meet");
                          }
                        }}
                        className={cn(
                          "flex-1 h-11 min-h-[44px] rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                          currentPanelSettings?.conferenceType === "google_meet"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5"
                        )}
                      >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M34.5 24.5c0-.5 0-1-.1-1.5H24v2.8h5.9c-.3 1.4-1 2.6-2.1 3.4v2.8h3.4c2-1.8 3.3-4.5 3.3-7.5z" fill="#4285F4"/>
                          <path d="M24 35c2.9 0 5.3-.9 7-2.5l-3.4-2.6c-.9.6-2.1 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4h-3.5v2.7C16.3 32.8 19.9 35 24 35z" fill="#34A853"/>
                          <path d="M18.1 26.5c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2v-2.7h-3.5C13.6 21.4 13 22.6 13 24s.6 2.6 1.6 3.6l3.5-2.1z" fill="#FBBC04"/>
                          <path d="M24 17.1c1.6 0 3 .5 4.1 1.6l3-3C29.3 13.9 26.9 13 24 13c-4.1 0-7.7 2.2-9.5 5.5l3.5 2.7c.8-2.5 3.1-4.1 6-4.1z" fill="#EA4335"/>
                        </svg>
                        <span>{t.googleMeetOption}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (currentPanelSettings?.conferenceType !== "custom") {
                            updateSelectedSlotsField("conferenceType", "custom");
                          }
                        }}
                        className={cn(
                          "flex-1 h-11 min-h-[44px] rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                          currentPanelSettings?.conferenceType === "custom"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5"
                        )}
                      >
                        <Link className="w-4 h-4 shrink-0" />
                        <span>{t.customLinkOption}</span>
                      </button>
                    </div>

                    {/* Google Meet content */}
                    {currentPanelSettings?.conferenceType === "google_meet" && (
                      currentPanelSettings.googleMeetLink ? (
                        <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-input bg-background">
                          <a
                            href={currentPanelSettings.googleMeetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-xs text-primary underline truncate"
                          >
                            {currentPanelSettings.googleMeetLink}
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedSlotsField("googleMeetLink", "");
                            }}
                            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isGeneratingMeet}
                          onClick={() => generateGoogleMeetLink()}
                          className="w-full h-10 px-3 rounded-xl border border-dashed border-border bg-background text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center gap-2 cursor-pointer"
                        >
                          {isGeneratingMeet ? (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          ) : (
                            <Plus className="w-4 h-4 shrink-0" />
                          )}
                          <span>{t.addMeetLink}</span>
                        </button>
                      )
                    )}

                    {/* Custom link content */}
                    {currentPanelSettings?.conferenceType === "custom" && (
                      <input
                        type="url"
                        placeholder={t.customLinkPlaceholder}
                        value={currentPanelSettings?.customConferenceLink || ""}
                        onChange={(e) => updateSelectedSlotsField("customConferenceLink", e.target.value)}
                        className="w-full h-10 px-3 text-xs rounded-xl border border-input bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                      />
                    )}
                  </div>

                  {/* Lesson Details Dialog Button */}
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDetailsDialogOpen(true)}
                      className="w-full justify-between h-11 min-h-[44px] px-4 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all rounded-xl shadow-xs cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-foreground">{t.details}</span>
                      <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Button>
                  </div>
                </div>

                {/* Repetition Card */}
                <div
                  className={cn(
                    "p-4 rounded-2xl border bg-card shadow-sm space-y-3 transition-all",
                    selectedSlotKeys.size > 0
                      ? "border-primary/40 ring-1 ring-primary/20 opacity-100"
                      : "border-border/60 opacity-60 pointer-events-none"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="mobile-repeat-switch"
                      className="text-xs font-semibold cursor-pointer flex items-center gap-1.5 text-foreground"
                    >
                      <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{t.everyWeek}</span>
                      {isDifferentRepeat && (
                        <span className="text-[11px] text-muted-foreground font-normal italic">
                          ({t.different})
                        </span>
                      )}
                      <ReqStar />
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
                          {(["1week", "1month", "2months", "custom"] as const).map((period) => {
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
                                  : period === "2months"
                                  ? t.twoMonths
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
                  {/* 7 Days Header (Mon-Sun) */}
                  <div className="grid grid-cols-7 bg-muted/50 border-b border-border sticky top-0 z-10">
                    {t.weekDays.map((dayName, idx) => {
                      const date = weekDates[idx];
                      const isCur = isSameDay(date, new Date());
                      const dateStr = format(date, "yyyy-MM-dd");
                      const isDaySelectedInStep2 = Array.from(selectedSlotKeys).some((key) => key.startsWith(`${dateStr}_`));
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "py-2 px-1 text-center border-r last:border-r-0 border-border/60 flex flex-col items-center justify-center transition-colors relative",
                            isDaySelectedInStep2 && "bg-primary/15"
                          )}
                        >
                          {idx === 0 && weekOffset > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                changeWeek(weekOffset - 1);
                              }}
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-muted border border-border/80 hover:border-primary/50 flex items-center justify-center text-foreground/80 hover:text-primary transition-all z-20 cursor-pointer shadow-xs"
                              title="Предыдущая неделя"
                            >
                              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          )}
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
                          {idx === 6 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                changeWeek(weekOffset + 1);
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-muted border border-border/80 hover:border-primary/50 flex items-center justify-center text-foreground/80 hover:text-primary transition-all z-20 cursor-pointer shadow-xs"
                              title="Следующая неделя"
                            >
                              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          )}
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
                              const date = weekDates[dayIdx];
                              const dateStr = date ? format(date, "yyyy-MM-dd") : `${dayIdx}`;
                              const key = `${dateStr}_${interval.start}_${interval.end}`;
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

                {/* Single Combined Button under schedule: Select All / Unselect All */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-end mt-3 mb-2 px-1"
                >
                  {(() => {
                    const isAllSelected = allSlotKeys.length > 0 && allSlotKeys.every((k) => selectedSlotKeys.has(k));
                    return (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={allSlotKeys.length === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAllSelected) {
                            setSelectedSlotKeys((prev) => {
                              const next = new Set(prev);
                              allSlotKeys.forEach((k) => next.delete(k));
                              return next;
                            });
                          } else {
                            handleSelectAllSlots();
                          }
                        }}
                        className={cn(
                          "text-xs sm:text-sm h-8 px-3.5 rounded-lg transition-colors shadow-2xs font-medium",
                          isAllSelected
                            ? "bg-card text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive font-semibold"
                            : "bg-card text-foreground border-border hover:bg-primary hover:text-primary-foreground hover:border-primary"
                        )}
                      >
                        {isAllSelected ? t.unselectAll : t.selectAll}
                      </Button>
                    );
                  })()}
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
                    <p
                      className={cn(
                        "text-base sm:text-[17px] font-medium transition-all",
                        selectedSlotKeys.size > 0
                          ? "text-foreground opacity-100"
                          : "text-muted-foreground opacity-60"
                      )}
                    >
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
                      <Label
                        className={cn(
                          "text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors",
                          selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                        )}
                      >
                        <Timer className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.lessonDuration}</span>
                        <ReqStar className={selectedSlotKeys.size > 0 ? "text-primary" : "text-muted-foreground/60"} />
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
                          "text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors",
                          selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                        )}
                      >
                        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.participants}</span>
                        <ReqStar className={selectedSlotKeys.size > 0 ? "text-primary" : "text-muted-foreground/60"} />
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

                    {/* For Product */}
                    {products && products.length > 0 && (
                      <div className="space-y-1.5 pt-1 -mx-1 sm:-mx-1.5">
                        <Label
                          className={cn(
                            "text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors",
                            selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                          )}
                        >
                          <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span>{t.forProduct}</span>
                          <ReqStar className={selectedSlotKeys.size > 0 ? "text-primary" : "text-muted-foreground/60"} />
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

                    {/* Conference Link Section */}
                    <div className="pt-1 -mx-1 sm:-mx-1.5 space-y-2">
                      <Label
                        className={cn(
                          "text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors",
                          selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                        )}
                      >
                        <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{t.conferenceLink}</span>
                      </Label>

                      {/* Two toggle buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={selectedSlotKeys.size === 0 || isGeneratingMeet}
                          onClick={() => {
                            if (currentPanelSettings?.conferenceType !== "google_meet") {
                              updateSelectedSlotsField("conferenceType", "google_meet");
                            }
                          }}
                          className={cn(
                            "flex-1 h-11 sm:h-12 min-h-[44px] rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5",
                            selectedSlotKeys.size === 0 ? "opacity-40 cursor-not-allowed border-border bg-background text-foreground" :
                            currentPanelSettings?.conferenceType === "google_meet"
                              ? "border-primary bg-primary/10 text-primary cursor-pointer"
                              : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                          )}
                        >
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M34.5 24.5c0-.5 0-1-.1-1.5H24v2.8h5.9c-.3 1.4-1 2.6-2.1 3.4v2.8h3.4c2-1.8 3.3-4.5 3.3-7.5z" fill="#4285F4"/>
                            <path d="M24 35c2.9 0 5.3-.9 7-2.5l-3.4-2.6c-.9.6-2.1 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4h-3.5v2.7C16.3 32.8 19.9 35 24 35z" fill="#34A853"/>
                            <path d="M18.1 26.5c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2v-2.7h-3.5C13.6 21.4 13 22.6 13 24s.6 2.6 1.6 3.6l3.5-2.1z" fill="#FBBC04"/>
                            <path d="M24 17.1c1.6 0 3 .5 4.1 1.6l3-3C29.3 13.9 26.9 13 24 13c-4.1 0-7.7 2.2-9.5 5.5l3.5 2.7c.8-2.5 3.1-4.1 6-4.1z" fill="#EA4335"/>
                          </svg>
                          <span>{t.googleMeetOption}</span>
                        </button>

                        <button
                          type="button"
                          disabled={selectedSlotKeys.size === 0}
                          onClick={() => {
                            if (currentPanelSettings?.conferenceType !== "custom") {
                              updateSelectedSlotsField("conferenceType", "custom");
                            }
                          }}
                          className={cn(
                            "flex-1 h-11 sm:h-12 min-h-[44px] rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5",
                            selectedSlotKeys.size === 0 ? "opacity-40 cursor-not-allowed border-border bg-background text-foreground" :
                            currentPanelSettings?.conferenceType === "custom"
                              ? "border-primary bg-primary/10 text-primary cursor-pointer"
                              : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                          )}
                        >
                          <Link className="w-4 h-4 shrink-0" />
                          <span>{t.customLinkOption}</span>
                        </button>
                      </div>

                      {/* Google Meet content */}
                      {currentPanelSettings?.conferenceType === "google_meet" && (
                        currentPanelSettings.googleMeetLink ? (
                          <div className="flex items-center gap-2 h-11 sm:h-12 px-3 rounded-xl border border-input bg-background">
                            <a
                              href={currentPanelSettings.googleMeetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 text-xs sm:text-sm text-primary underline truncate"
                            >
                              {currentPanelSettings.googleMeetLink}
                            </a>
                            <button
                              type="button"
                              onClick={() => updateSelectedSlotsField("googleMeetLink", "")}
                              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={selectedSlotKeys.size === 0 || isGeneratingMeet}
                            onClick={() => generateGoogleMeetLink()}
                            className={cn(
                              "w-full h-11 sm:h-12 px-3 rounded-xl border border-dashed border-border bg-background text-xs sm:text-sm text-muted-foreground transition-all flex items-center gap-2",
                              selectedSlotKeys.size === 0 ? "opacity-40 cursor-not-allowed" : "hover:border-primary/40 hover:text-primary cursor-pointer"
                            )}
                          >
                            {isGeneratingMeet ? (
                              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            ) : (
                              <Plus className="w-4 h-4 shrink-0" />
                            )}
                            <span>{t.addMeetLink}</span>
                          </button>
                        )
                      )}

                      {/* Custom link content */}
                      {currentPanelSettings?.conferenceType === "custom" && (
                        <input
                          type="url"
                          placeholder={t.customLinkPlaceholder}
                          value={currentPanelSettings?.customConferenceLink || ""}
                          onChange={(e) => updateSelectedSlotsField("customConferenceLink", e.target.value)}
                          className="w-full h-11 sm:h-12 px-3 text-xs sm:text-sm rounded-xl border border-input bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                        />
                      )}
                    </div>

                    {/* Lesson Details Dialog Button with gray pencil */}
                    <div className="pt-1 -mx-1 sm:-mx-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={selectedSlotKeys.size === 0}
                        onClick={() => setIsDetailsDialogOpen(true)}
                        className="w-full justify-between h-11 sm:h-12 min-h-[44px] px-4 border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all rounded-xl shadow-xs"
                      >
                        <span
                          className={cn(
                            "text-xs sm:text-sm font-semibold transition-colors",
                            selectedSlotKeys.size > 0 ? "text-foreground" : "text-muted-foreground opacity-60"
                          )}
                        >
                          {t.details}
                        </span>
                        <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Button>
                    </div>
                  </div>

                  {/* Title above Repeat Schedule with spacious gap from settings card above */}
                  <div className="flex items-center justify-between pt-8 sm:pt-10">
                    <p
                      className={cn(
                        "text-base sm:text-[17px] font-medium whitespace-pre-line leading-snug transition-all",
                        selectedSlotKeys.size > 0
                          ? "text-foreground opacity-100"
                          : "text-muted-foreground opacity-60"
                      )}
                    >
                      {t.repeatScheduleTitle}
                    </p>
                  </div>

                  {/* Separate Repetition Card under Settings Card */}
                  <div
                    className={cn(
                      "p-4 sm:p-4.5 rounded-2xl border bg-card shadow-sm space-y-3 transition-all",
                      selectedSlotKeys.size > 0
                        ? "border-primary/40 ring-1 ring-primary/20 opacity-100"
                        : "border-border/60 opacity-60 pointer-events-none"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="repeat-switch"
                        className={cn(
                          "text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-1.5 transition-colors",
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
                        <ReqStar className={selectedSlotKeys.size > 0 ? "text-primary" : "text-muted-foreground/60"} />
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
                            {(["1week", "1month", "2months", "custom"] as const).map((period) => {
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
                                    : period === "2months"
                                    ? t.twoMonths
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
          <DialogContent hideCloseButton className="max-w-lg sm:max-w-xl w-full p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4">
            {/* Header: Title */}
            <div className="pb-1 border-b border-border/50">
              <DialogTitle className="text-base sm:text-lg font-semibold text-foreground">
                {t.details}
              </DialogTitle>
            </div>

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

        {/* Separate Window for Cover Cropping in Wizard (Portal with frosted blur backdrop like avatar crop) */}
        {Boolean(coverCrop.source) &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 motion-safe:animate-fade-in">
              <div
                className="login-modal-backdrop absolute inset-0"
                onClick={() => !cropSaving && coverCrop.resetCrop()}
                aria-hidden="true"
              />
              <Card className="relative z-10 w-full max-w-lg sm:max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4">
                <div className="pb-1 border-b border-border/50">
                  <h3 className="text-base sm:text-lg font-semibold text-foreground">
                    {language === "ru" ? "Настройка обложки" : "Мұқабаны баптау"}
                  </h3>
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
                      onCancel={() => {
                        coverCrop.resetCrop();
                      }}
                      onSave={() => void handleSaveCrop()}
                    />
                  )}
                </div>
              </Card>
            </div>,
            document.body
          )}

        {/* Mobile bottom container: Step 1 Intervals Panel + Step Switcher */}
        <div ref={mobileBottomBarRef} className="flex sm:hidden fixed bottom-0 left-0 right-0 z-30 flex-col">
          {step === 1 && (
            <div className="bg-card/95 backdrop-blur-sm border-t border-border/80 p-3 px-4 shadow-lg space-y-2">
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary" />
                {t.repeatSummary}
              </span>
              {currentDayEditableIntervals.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 h-9 overflow-y-auto overscroll-contain touch-pan-y pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent">
                  {currentDayEditableIntervals.map(({ interval, originalIdx }) => (
                    <div
                      key={originalIdx}
                      className="flex items-center justify-center gap-1.5 bg-primary/10 border border-primary/30 text-primary font-mono text-sm px-2.5 h-9 rounded-xl w-full"
                    >
                      <EditableTime
                        time={interval.start}
                        availableHours={getAvailableHoursForDay(mobileDayIdx, interval.start, originalIdx, false)}
                        isTimeInPast={(timeStr) => isCellInPast(mobileDayIdx, timeStr)}
                        language={language}
                        onChange={(newTime, isSilent) => updateIntervalTime(mobileDayIdx, originalIdx, newTime, interval.end, isSilent)}
                      />
                      <span className="text-muted-foreground font-semibold text-sm">–</span>
                      <EditableTime
                        time={interval.end}
                        availableHours={getAvailableHoursForDay(
                          mobileDayIdx,
                          interval.end,
                          originalIdx,
                          true,
                          addMinutesToTime(interval.start, 30)
                        )}
                        minTime={addMinutesToTime(interval.start, 30)}
                        isTimeInPast={(timeStr) => isCellInPast(mobileDayIdx, timeStr)}
                        language={language}
                        onChange={(newTime, isSilent) => updateIntervalTime(mobileDayIdx, originalIdx, interval.start, newTime, isSilent)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-9 flex items-center text-xs text-muted-foreground">
                  {t.noSlotsWarning}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-center py-2.5 px-4 border-t bg-card/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 bg-muted/70 p-1.5 rounded-full border border-border/50">
              <button
                type="button"
                onClick={() => handleStepChange(1)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer",
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
                disabled={editableDaysOnDesktop.length === 0}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all disabled:opacity-40 cursor-pointer",
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
        </div>

        {/* Account Settings Dialog for Timezone Selection */}
        <AccountSettingsDialog
          open={isTimezoneSettingsOpen}
          onOpenChange={setIsTimezoneSettingsOpen}
          role={effectiveRole}
          displayName={shownName}
          userId={effectiveUserId}
          initialSection="timezone"
        />
      </DialogContent>
    </Dialog>
  );
}
