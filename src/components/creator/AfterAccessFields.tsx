import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function AfterAccessFields({ enabled, url, onChange }: {
  enabled: boolean;
  url: string;
  onChange: (value: { afterAccessEnabled?: boolean; afterAccessUrl?: string }) => void;
}) {
  return (
    <div className="space-y-3 border-t pt-5">
      <div className="font-bold">
        После получения доступа <span className="text-destructive">*</span>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="after-access-enabled" className="font-bold">
          Добавить ссылку на вступление в группу
        </label>
        <Switch id="after-access-enabled" checked={enabled} onCheckedChange={(value) => onChange({ afterAccessEnabled: value })} />
      </div>
      {enabled && <div className="space-y-2">
        <Input id="after-access-url" aria-label="Ссылка на вступление в группу" type="url" inputMode="url" placeholder="https://…" maxLength={2048} required value={url} onChange={(event) => onChange({ afterAccessUrl: event.target.value })} />
        <p className="text-base leading-relaxed text-muted-foreground">После покупки человеку автоматически придет сообщение с ссылкой на вступление</p>
      </div>}
    </div>
  );
}
