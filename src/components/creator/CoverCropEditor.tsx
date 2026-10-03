import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, ZoomIn, ZoomOut, Move } from "lucide-react";

type CoverCropEditorProps = {
  source: string;
  mediaType: "image" | "video";
  previewStyle?: CSSProperties;
  zoom: number;
  onZoom: (value: number) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  saving?: boolean;
  onSave: () => void;
};

const CoverCropEditor = ({
  source,
  mediaType,
  previewStyle,
  zoom,
  onZoom,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  saving = false,
  onSave,
}: CoverCropEditorProps) => {
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    onZoom(zoom + delta);
  };

  return (
    <div className="space-y-4 select-none w-full">
      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Move className="w-3.5 h-3.5" />
        <span>
          Перетащите {mediaType === "video" ? "видео" : "фото"} мышкой или пальцем для выравнивания
        </span>
      </div>

      {/* 16:10 Cover Frame (exact ratio of product cards) */}
      <div
        className="relative mx-auto w-full max-w-[384px] aspect-[16/10] cursor-grab overflow-hidden rounded-2xl border-2 border-primary/40 bg-black/90 shadow-inner active:cursor-grabbing touch-none select-none ring-4 ring-black/5 flex items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={handleWheel}
      >
        {mediaType === "video" ? (
          <video
            src={source}
            autoPlay
            loop
            muted
            playsInline
            draggable={false}
            className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none"
            style={previewStyle}
          />
        ) : (
          <img
            src={source}
            alt="cover preview"
            draggable={false}
            className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none"
            style={previewStyle}
          />
        )}
      </div>

      {/* Zoom Controls */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>Масштаб</span>
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
            max={3}
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
            disabled={zoom >= 3 || saving}
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Only Save: a click outside the window or Escape is the way back. */}
      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Сохранить
        </Button>
      </div>
    </div>
  );
};

export default CoverCropEditor;
