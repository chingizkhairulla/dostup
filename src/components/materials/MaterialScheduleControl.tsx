import { CalendarDays } from 'lucide-react';
import { ru, kk } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { localMaterialDateTime } from '@/lib/materialDraft';

interface Props {
  enabled: boolean;
  value: string;
  onChange: (enabled: boolean, value: string) => void;
  label?: string;
}

export default function MaterialScheduleControl({ enabled, value, onChange, label = 'Запланировать добавление' }: Props) {
  const { language } = useLanguage();
  const parsed = value ? new Date(value) : null;
  const selected = parsed && Number.isFinite(parsed.getTime()) ? parsed : undefined;
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
      <Label className="min-w-0 text-sm font-normal">{label}</Label>
      <div className="flex shrink-0 items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" disabled={!enabled}
              aria-label="Выбрать дату и время" title={enabled && selected ? selected.toLocaleString(language === 'kk' ? 'kk-KZ' : 'ru-RU') : 'Выбрать дату и время'}
              className="h-8 w-8 min-h-0 text-primary hover:bg-primary/10 hover:text-primary">
              <CalendarDays className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto max-w-[calc(100vw-1rem)] p-0" aria-label="Дата и время добавления">
            <Calendar mode="single" locale={language === 'kk' ? kk : ru} selected={selected} defaultMonth={selected}
              onSelect={date => {
                if (!date) return;
                const time = selected ?? new Date();
                date.setHours(time.getHours(), time.getMinutes(), 0, 0);
                onChange(true, localMaterialDateTime(date));
              }} />
            <Label className="flex items-center gap-3 border-t px-3 py-3 text-sm font-normal">
              Время
              <Input type="time" aria-label="Время добавления" className="min-w-0 flex-1" value={value.slice(11, 16)}
                onChange={event => onChange(true, `${(value || localMaterialDateTime()).slice(0, 10)}T${event.target.value}`)} />
            </Label>
          </PopoverContent>
        </Popover>
        <Switch aria-label={label} checked={enabled}
          onCheckedChange={checked => onChange(checked, value || localMaterialDateTime())} />
      </div>
    </div>
  );
}
