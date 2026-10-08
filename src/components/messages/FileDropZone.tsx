import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type UploadFiles = (files: File[]) => void;
type DropContext = { enabled: boolean; register: (handler: UploadFiles | null) => void; upload: UploadFiles };
const Context = createContext<DropContext | null>(null);

export function FileDropProvider({ children }: { children: ReactNode }) {
  const handler = useRef<UploadFiles | null>(null);
  const [enabled, setEnabled] = useState(false);
  const register = useCallback((next: UploadFiles | null) => { handler.current = next; setEnabled(!!next); }, []);
  const upload = useCallback((files: File[]) => handler.current?.(files), []);
  return <Context.Provider value={{ enabled, register, upload }}>{children}</Context.Provider>;
}

function DropSurface({ enabled, onFiles, children, className }: { enabled: boolean; onFiles: UploadFiles; children: ReactNode; className?: string }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return <div data-chat-drop-zone className={cn("relative min-w-0", className)}
    onDragEnter={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      depth.current += 1;
      if (enabled) setOver(true);
    }}
    onDragOver={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = enabled ? "copy" : "none";
    }}
    onDragLeave={() => {
      if (!depth.current) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    }}
    onDragEnd={() => { depth.current = 0; setOver(false); }}
    onDrop={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault(); event.stopPropagation();
      depth.current = 0; setOver(false);
      if (!enabled) { toast.info("Загрузка файлов здесь недоступна"); return; }
      const files = Array.from(event.dataTransfer.files);
      if (files.length) onFiles(files);
      else toast.error("Перетащите файлы, а не папку");
    }}>
    {children}
    {over && enabled && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/95 p-6">
      <div className="flex flex-col items-center gap-3 text-center text-primary"><Upload className="h-9 w-9" /><p className="font-semibold">Отпустите файлы для загрузки</p></div>
    </div>}
  </div>;
}

export function FileDropTarget({ children, className }: { children: ReactNode; className?: string }) {
  const context = useContext(Context);
  return <DropSurface enabled={!!context?.enabled} onFiles={(files) => context?.upload(files)} className={className}>{children}</DropSurface>;
}

/** Registers the composer with the whole conversation pane; works alone in support cards too. */
export function FileDropZone({ enabled, onFiles, children, className }: { enabled: boolean; onFiles: UploadFiles; children: ReactNode; className?: string }) {
  const context = useContext(Context);
  const latest = useRef(onFiles);
  latest.current = onFiles;
  const register = context?.register;
  useEffect(() => {
    if (!register) return;
    register(enabled ? (files) => latest.current(files) : null);
    return () => register(null);
  }, [register, enabled]);
  if (context) return <div className={className}>{children}</div>;
  return <DropSurface enabled={enabled} onFiles={onFiles} className={className}>{children}</DropSurface>;
}
