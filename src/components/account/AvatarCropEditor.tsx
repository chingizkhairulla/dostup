import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, ZoomIn, ZoomOut, Move } from "lucide-react";

type AvatarCropEditorProps = {
  source: string;
  previewStyle?: CSSProperties;
  zoom: number;
  onZoom: (value: number) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
};

const AvatarCropEditor = ({
  source,
  previewStyle,
  zoom,
  onZoom,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  saving = false,
  onCancel,
  onSave,
}: AvatarCropEditorProps) => {
  const { t, language, l } = useLanguage();

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    onZoom(zoom + delta);
  };

  return (
    <div className="space-y-4 select-none">
      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Move className="w-3.5 h-3.5" />
        <span>
          {l({ ru: "Перетащите фото мышкой или пальцем для выравнивания", kk: "Фотоны реттеу үшін жылжытыңыз", en: "Drag the photo with your mouse or finger to line it up" })}
        </span>
      </div>

      {/* Circular Crop Frame */}
      <div
        className="relative mx-auto h-60 w-60 sm:h-64 sm:w-64 cursor-grab overflow-hidden rounded-full border-2 border-primary/40 bg-muted/60 shadow-inner active:cursor-grabbing touch-none ring-4 ring-black/5"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={handleWheel}
      >
        <img
          src={source}
          alt=""
          draggable={false}
          className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none"
          style={previewStyle}
        />
      </div>

      {/* Zoom Control */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>{t("avatarZoom")}</span>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onZoom(zoom - 0.2)}
            disabled={zoom <= 1 || saving}
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <Slider
            min={1}
            max={3.5}
            step={0.02}
            value={[zoom]}
            onValueChange={([value]) => onZoom(value ?? 1)}
            disabled={saving}
            className="flex-1 cursor-pointer"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onZoom(zoom + 0.2)}
            disabled={zoom >= 3.5 || saving}
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl"
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t("save")}
        </Button>
      </div>
    </div>
  );
};

export default AvatarCropEditor;
