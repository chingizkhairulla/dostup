import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, CreditCard, BellOff, Loader2 } from "lucide-react";
import { studentCreds, invokeApi } from "@/lib/sessionApi";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

interface NotificationPreferencesProps {
  userId: string;
  role?: "buyer" | "creator" | "school" | "teacher";
}

interface Preferences {
  reminder_24h: boolean;
  reminder_morning: boolean;
  morning_time: string;
  reminder_2h: boolean;
  payment_reminder_week: boolean;
  payment_reminder_day: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  reminder_24h: true,
  reminder_morning: false,
  morning_time: "08:00",
  reminder_2h: true,
  payment_reminder_week: true,
  payment_reminder_day: true,
};

const MORNING_TIMES = [
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"
];

const NotificationPreferences = ({ userId, role = "buyer" }: NotificationPreferencesProps) => {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [localPrefs, setLocalPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [noLessonReminders, setNoLessonReminders] = useState(false);
  const [noPaymentReminders, setNoPaymentReminders] = useState(false);

  const translations = {
    ru: {
      lessonTitle: "Об уроке",
      reminder24h: "За 24 часа до урока",
      reminderMorning: "Утром в день занятия",
      reminder2h: "За 2 часа до урока",
      noReminders: "Без напоминаний",
      morningTimeLabel: "Время утреннего напоминания",
      saved: "Настройки сохранены",
      saveFailed: "Не удалось сохранить",
      morningNote: "Одно уведомление обо всех уроках за день",
      paymentTitle: "Об оплате",
      paymentWeek: "За неделю до оплаты",
      paymentDay: "За день до оплаты",
      paymentNoReminders: "Без напоминания",
    },
    kk: {
      lessonTitle: "Сабақ туралы",
      reminder24h: "Сабақтан 24 сағат бұрын",
      reminderMorning: "Сабақ күні таңертең",
      reminder2h: "Сабақтан 2 сағат бұрын",
      noReminders: "Еске салусыз",
      morningTimeLabel: "Таңғы еске салу уақыты",
      saved: "Параметрлер сақталды",
      saveFailed: "Сақтау сәтсіз аяқталды",
      morningNote: "Күндегі барлық сабақтар туралы бір хабарландыру",
      paymentTitle: "Төлем туралы",
      paymentWeek: "Төлемге дейін 1 апта бұрын",
      paymentDay: "Төлемге дейін 1 күн бұрын",
      paymentNoReminders: "Еске салусыз",
    },
  };

  const t = translations[language];

  // Fetch existing preferences
  const { data: existingPrefs, isLoading } = useQuery({
    queryKey: ["notification-preferences", userId],
    queryFn: async () => {
      const data = await invokeApi<{ prefs: {
        reminder_24h: boolean;
        reminder_morning: boolean;
        morning_time: string | null;
        reminder_2h: boolean;
        payment_reminder_week?: boolean;
        payment_reminder_day?: boolean;
      } | null }>("manage-account", { action: "get_prefs", ...studentCreds() });
      return data.prefs;
    },
    enabled: !!userId,
  });

  // Update local state when data loads
  useEffect(() => {
    let savedWeek = true;
    let savedDay = true;
    try {
      const w = localStorage.getItem(`pay_rem_week_${userId}`);
      if (w !== null) savedWeek = w === "true";
      const d = localStorage.getItem(`pay_rem_day_${userId}`);
      if (d !== null) savedDay = d === "true";
    } catch {
      // ignore
    }

    if (existingPrefs) {
      const week = existingPrefs.payment_reminder_week !== undefined ? !!existingPrefs.payment_reminder_week : savedWeek;
      const day = existingPrefs.payment_reminder_day !== undefined ? !!existingPrefs.payment_reminder_day : savedDay;
      const prefs: Preferences = {
        reminder_24h: existingPrefs.reminder_24h,
        reminder_morning: existingPrefs.reminder_morning,
        morning_time: existingPrefs.morning_time?.slice(0, 5) || "08:00",
        reminder_2h: existingPrefs.reminder_2h,
        payment_reminder_week: week,
        payment_reminder_day: day,
      };
      setLocalPrefs(prefs);
      setNoLessonReminders(!prefs.reminder_24h && !prefs.reminder_morning && !prefs.reminder_2h);
      setNoPaymentReminders(!week && !day);
    }
  }, [existingPrefs, userId]);

  // Save preferences mutation
  const saveMutation = useMutation({
    mutationFn: async (prefs: Preferences) => {
      try {
        localStorage.setItem(`pay_rem_week_${userId}`, String(prefs.payment_reminder_week));
        localStorage.setItem(`pay_rem_day_${userId}`, String(prefs.payment_reminder_day));
      } catch {
        // ignore
      }
      await invokeApi("manage-account", {
        action: "save_prefs",
        ...studentCreds(),
        prefs,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences", userId] });
      toast.success(t.saved);
    },
    onError: () => {
      toast.error(t.saveFailed);
    },
  });

  const handleLessonPrefChange = (key: keyof Preferences, value: boolean | string) => {
    const newPrefs = { ...localPrefs, [key]: value };
    if (typeof value === "boolean" && value) {
      setNoLessonReminders(false);
    }
    setLocalPrefs(newPrefs);
    saveMutation.mutate(newPrefs);
  };

  const handleNoLessonReminders = (checked: boolean) => {
    setNoLessonReminders(checked);
    if (checked) {
      const newPrefs = {
        ...localPrefs,
        reminder_24h: false,
        reminder_morning: false,
        reminder_2h: false,
      };
      setLocalPrefs(newPrefs);
      saveMutation.mutate(newPrefs);
    }
  };

  const handlePaymentPrefChange = (key: "payment_reminder_week" | "payment_reminder_day", value: boolean) => {
    const newPrefs = { ...localPrefs, [key]: value };
    if (value) {
      setNoPaymentReminders(false);
    }
    setLocalPrefs(newPrefs);
    saveMutation.mutate(newPrefs);
  };

  const handleNoPaymentReminders = (checked: boolean) => {
    setNoPaymentReminders(checked);
    if (checked) {
      const newPrefs = {
        ...localPrefs,
        payment_reminder_week: false,
        payment_reminder_day: false,
      };
      setLocalPrefs(newPrefs);
      saveMutation.mutate(newPrefs);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isBuyer = role === "buyer";

  return (
    <div className="space-y-4">
      {/* Lesson reminders block */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-primary" />
            {t.lessonTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 24 hours before */}
          <div className="flex items-center space-x-3">
            <Checkbox
              id="reminder_24h"
              checked={localPrefs.reminder_24h}
              onCheckedChange={(checked) => handleLessonPrefChange("reminder_24h", !!checked)}
              disabled={saveMutation.isPending}
            />
            <Label htmlFor="reminder_24h" className="text-sm font-normal cursor-pointer">
              {t.reminder24h}
            </Label>
          </div>

          {/* Morning of lesson day */}
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="reminder_morning"
                checked={localPrefs.reminder_morning}
                onCheckedChange={(checked) => handleLessonPrefChange("reminder_morning", !!checked)}
                disabled={saveMutation.isPending}
              />
              <Label htmlFor="reminder_morning" className="text-sm font-normal cursor-pointer">
                {t.reminderMorning}
              </Label>
            </div>
            
            {localPrefs.reminder_morning && (
              <div className="ml-7 space-y-2">
                <Select
                  value={localPrefs.morning_time}
                  onValueChange={(value) => handleLessonPrefChange("morning_time", value)}
                  disabled={saveMutation.isPending}
                >
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MORNING_TIMES.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t.morningNote}
                </p>
              </div>
            )}
          </div>

          {/* 2 hours before */}
          <div className="flex items-center space-x-3">
            <Checkbox
              id="reminder_2h"
              checked={localPrefs.reminder_2h}
              onCheckedChange={(checked) => handleLessonPrefChange("reminder_2h", !!checked)}
              disabled={saveMutation.isPending}
            />
            <Label htmlFor="reminder_2h" className="text-sm font-normal cursor-pointer">
              {t.reminder2h}
            </Label>
          </div>

          {/* No reminders */}
          <div className="pt-2 border-t">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="no_lesson_reminders"
                checked={noLessonReminders}
                onCheckedChange={(checked) => handleNoLessonReminders(!!checked)}
                disabled={saveMutation.isPending}
              />
              <Label htmlFor="no_lesson_reminders" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
                {t.noReminders}
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment reminders block (buyers only) */}
      {isBuyer && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              {t.paymentTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 1 week before payment */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="payment_reminder_week"
                checked={localPrefs.payment_reminder_week}
                onCheckedChange={(checked) => handlePaymentPrefChange("payment_reminder_week", !!checked)}
                disabled={saveMutation.isPending}
              />
              <Label htmlFor="payment_reminder_week" className="text-sm font-normal cursor-pointer">
                {t.paymentWeek}
              </Label>
            </div>

            {/* 1 day before payment */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="payment_reminder_day"
                checked={localPrefs.payment_reminder_day}
                onCheckedChange={(checked) => handlePaymentPrefChange("payment_reminder_day", !!checked)}
                disabled={saveMutation.isPending}
              />
              <Label htmlFor="payment_reminder_day" className="text-sm font-normal cursor-pointer">
                {t.paymentDay}
              </Label>
            </div>

            {/* No payment reminders */}
            <div className="pt-2 border-t">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="no_payment_reminders"
                  checked={noPaymentReminders}
                  onCheckedChange={(checked) => handleNoPaymentReminders(!!checked)}
                  disabled={saveMutation.isPending}
                />
                <Label htmlFor="no_payment_reminders" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                  <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
                  {t.paymentNoReminders}
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default NotificationPreferences;
