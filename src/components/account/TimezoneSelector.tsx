import { useState, useMemo } from "react";
import { Search, Check, Globe2, Compass, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTimezone } from "@/contexts/TimezoneContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  detectBrowserTimezone,
  searchCityTimezones,
  CityTimezoneItem,
} from "@/lib/timezones";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const TimezoneSelector = () => {
  const { timezone, userCity, setTimezone } = useTimezone();
  const { language } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState("");

  const activeCity =
    userCity ||
    (language === "kk" && timezone.cityKk ? timezone.cityKk : timezone.city)
      .split(",")[0]
      .trim();

  const activeGmt = timezone.offsetLabel.replace("UTC", "GMT");

  const filteredItems = useMemo(() => {
    return searchCityTimezones(search, language);
  }, [search, language]);

  const handleSelectCityItem = (item: CityTimezoneItem) => {
    setTimezone(item.timezoneId, item.city);
    toast.success(
      language === "ru"
        ? `Часовой пояс: ${item.displayLabel}`
        : `Уақыт белдеуі: ${item.displayLabel}`
    );
    setIsEditing(false);
    setSearch("");
  };

  const handleAutoDetect = () => {
    const detected = detectBrowserTimezone();
    const primary = detected.city.split(",")[0].trim();
    setTimezone(detected, primary);
    const gmt = detected.offsetLabel.replace("UTC", "GMT");
    toast.success(
      language === "ru"
        ? `Определён часовой пояс: ${primary} (${gmt})`
        : `Уақыт белдеуі анықталды: ${primary} (${gmt})`
    );
    setIsEditing(false);
    setSearch("");
  };

  return (
    <div className="space-y-3">
      {/* Current Active Timezone Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border border-border bg-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground font-medium">
            <Globe2 className="w-4 h-4 text-primary shrink-0" />
            <span>
              {language === "ru" ? "Выбранный часовой пояс:" : "Таңдалған уақыт белдеуі:"}
            </span>
          </div>
          <p className="text-base sm:text-lg font-semibold text-foreground">
            {activeCity} ({activeGmt})
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setIsEditing(!isEditing);
            setSearch("");
          }}
          className="self-start sm:self-center h-9 px-4 rounded-lg font-medium text-xs sm:text-sm"
        >
          {isEditing
            ? language === "ru"
              ? "Готово"
              : "Дайын"
            : language === "ru"
            ? "Изменить"
            : "Өзгерту"}
        </Button>
      </div>

      {/* Editing section: Search + Auto-detect button + clean results */}
      {isEditing && (
        <div className="space-y-2.5 motion-safe:animate-fade-in pt-1">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  language === "ru"
                    ? "Поиск по городу или UTC"
                    : "Қала немесе UTC бойынша іздеу"
                }
                className="pl-9 pr-9 h-10 text-sm bg-background border-border/80 rounded-xl"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Auto-detect button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleAutoDetect}
              className="h-10 px-3.5 gap-1.5 text-xs sm:text-sm font-medium hover:bg-primary hover:text-white hover:border-primary text-foreground shrink-0 rounded-xl group transition-colors"
              title={language === "ru" ? "Определить по вашему браузеру" : "Браузер бойынша анықтау"}
            >
              <Compass className="w-4 h-4 text-primary group-hover:text-white hover:text-white transition-colors" />
              <span>{language === "ru" ? "Автоопределение" : "Автоанықтау"}</span>
            </Button>
          </div>

          {/* Results List: Only cities and GMT offsets */}
          <div className="border border-border/80 rounded-xl overflow-hidden bg-card shadow-xs">
            <ScrollArea className="h-[280px] sm:h-[320px] p-1.5">
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {language === "ru" ? "Ничего не найдено" : "Ештеңе табылмады"}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredItems.map((item) => {
                    const isSelected =
                      item.city === activeCity && item.offset === timezone.offset;

                    return (
                      <button
                        key={`${item.city}-${item.offsetLabel}`}
                        type="button"
                        onClick={() => handleSelectCityItem(item)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between gap-2 group cursor-pointer text-sm",
                          isSelected
                            ? "bg-primary/10 border-primary/50 text-foreground font-semibold"
                            : "bg-transparent hover:bg-muted/70 border-transparent text-foreground font-medium"
                        )}
                      >
                        <span>
                          {item.city} ({item.gmtLabel})
                        </span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimezoneSelector;
