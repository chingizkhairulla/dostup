import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { studentCreds, invokeApi } from "@/lib/sessionApi";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/language";
import { toast } from "sonner";

interface NotificationPreferencesProps {
  userId: string;
}

interface Preferences {
  reminder_24h: boolean;
  reminder_morning: boolean;
  morning_time: string;
  reminder_2h: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  reminder_24h: true,
  reminder_morning: false,
  morning_time: "08:00",
  reminder_2h: true,
};

const MORNING_TIMES = [
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"
];

const NotificationPreferences = ({ userId }: NotificationPreferencesProps) => {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [localPrefs, setLocalPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [noReminders, setNoReminders] = useState(false);

  // Typed by Language so a language without its block cannot compile.
  const translations: Record<Language, Record<string, string>> = {
    en: {
      title: "Lesson reminder settings",
      reminder24h: "24 hours before the lesson",
      reminderMorning: "In the morning on the day of the lesson",
      reminder2h: "2 hours before the lesson",
      noReminders: "No reminders",
      morningTimeLabel: "Morning reminder time",
      saved: "Settings saved",
      saveFailed: "Couldn't save",
      morningNote: "One notification for all of the day's lessons",
    },
    ru: {
      title: "Настройки напоминаний об уроке",
      reminder24h: "За 24 часа до урока",
      reminderMorning: "Утром в день занятия",
      reminder2h: "За 2 часа до урока",
      noReminders: "Без напоминаний",
      morningTimeLabel: "Время утреннего напоминания",
      saved: "Настройки сохранены",
      saveFailed: "Не удалось сохранить",
      morningNote: "Одно уведомление обо всех уроках за день",
    },
    kk: {
      title: "Сабақ туралы еске салу параметрлері",
      reminder24h: "Сабақтан 24 сағат бұрын",
      reminderMorning: "Сабақ күні таңертең",
      reminder2h: "Сабақтан 2 сағат бұрын",
      noReminders: "Еске салусыз",
      morningTimeLabel: "Таңғы еске салу уақыты",
      saved: "Параметрлер сақталды",
      saveFailed: "Сақтау сәтсіз аяқталды",
      morningNote: "Күндегі барлық сабақтар туралы бір хабарландыру",
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
      } | null }>("manage-account", { action: "get_prefs", ...studentCreds() });
      return data.prefs;
    },
    enabled: !!userId,
  });

  // Update local state when data loads
  useEffect(() => {
    if (existingPrefs) {
      const prefs = {
        reminder_24h: existingPrefs.reminder_24h,
        reminder_morning: existingPrefs.reminder_morning,
        morning_time: existingPrefs.morning_time?.slice(0, 5) || "08:00",
        reminder_2h: existingPrefs.reminder_2h,
      };
      setLocalPrefs(prefs);
      setNoReminders(!prefs.reminder_24h && !prefs.reminder_morning && !prefs.reminder_2h);
    }
  }, [existingPrefs]);

  // Save preferences mutation
  const saveMutation = useMutation({
    mutationFn: async (prefs: Preferences) => {
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

  const handlePrefChange = (key: keyof Preferences, value: boolean | string) => {
    const newPrefs = { ...localPrefs, [key]: value };
    
    // If enabling any reminder, disable "no reminders"
    if (typeof value === "boolean" && value) {
      setNoReminders(false);
    }
    
    setLocalPrefs(newPrefs);
    saveMutation.mutate(newPrefs);
  };

  const handleNoReminders = (checked: boolean) => {
    setNoReminders(checked);
    if (checked) {
      const newPrefs = {
        reminder_24h: false,
        reminder_morning: false,
        morning_time: localPrefs.morning_time,
        reminder_2h: false,
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

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" />
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 24 hours before */}
        <div className="flex items-center space-x-3">
          <Checkbox
            id="reminder_24h"
            checked={localPrefs.reminder_24h}
            onCheckedChange={(checked) => handlePrefChange("reminder_24h", !!checked)}
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
              onCheckedChange={(checked) => handlePrefChange("reminder_morning", !!checked)}
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
                onValueChange={(value) => handlePrefChange("morning_time", value)}
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
            onCheckedChange={(checked) => handlePrefChange("reminder_2h", !!checked)}
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
              id="no_reminders"
              checked={noReminders}
              onCheckedChange={(checked) => handleNoReminders(!!checked)}
              disabled={saveMutation.isPending}
            />
            <Label htmlFor="no_reminders" className="text-sm font-normal cursor-pointer flex items-center gap-2">
              <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
              {t.noReminders}
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationPreferences;
