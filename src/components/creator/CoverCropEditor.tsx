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
  onCancel: () => void;
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
  onCancel,
  onSave,
}: CoverCropEditorProps) => {
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    onZoom(zoom + delta);
  };

  return (
    <div className="space-y-3.5 select-none w-full">
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

      {/* Controls Row: Zoom on left | Cancel & Save on right */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
        {/* Zoom Slider to the left of buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-[220px]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onZoom(zoom - 0.2)}
            disabled={zoom <= 1 || saving}
            className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ZoomOut className="h-3.5 w-3.5" />
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
            className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground font-medium w-8 text-right shrink-0">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {/* Action Buttons on right */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
          >
            Отмена
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CoverCropEditor;
