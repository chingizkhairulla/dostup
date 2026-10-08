import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function AfterAccessFields({ enabled, url, onChange }: {
  enabled: boolean;
  url: string;
  onChange: (value: { afterAccessEnabled?: boolean; afterAccessUrl?: string }) => void;
}) {
  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="after-access-enabled" className="font-bold">
          После получения доступа {enabled && <span className="text-destructive">*</span>}
        </label>
        <Switch id="after-access-enabled" checked={enabled} onCheckedChange={(value) => onChange({ afterAccessEnabled: value })} />
      </div>
      {enabled && <div className="space-y-2">
        <label htmlFor="after-access-url" className="text-sm text-muted-foreground">Добавить ссылку на вступление в вашу группу:</label>
        <Input id="after-access-url" type="url" inputMode="url" placeholder="https://…" maxLength={2048} required value={url} onChange={(event) => onChange({ afterAccessUrl: event.target.value })} />
        <p className="text-xs leading-relaxed text-muted-foreground">После покупки человеку автоматически придет сообщение с ссылкой на вступление</p>
      </div>}
    </div>
  );
}
