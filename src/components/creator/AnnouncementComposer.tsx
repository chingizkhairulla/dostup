import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Send, Loader2, X, FileText, Play } from "lucide-react";
import { uploadAnnouncementMedia } from "@/hooks/useAnnouncements";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  productId: string;
  initialHtml?: string;
  onSave: (html: string) => Promise<void> | void;
  onCancel?: () => void;
  saving?: boolean;
  submitLabel?: string;
}

type Attachment =
  | { id: string; kind: "image"; url: string; name: string }
  | { id: string; kind: "video"; url: string; name: string }
  | { id: string; kind: "file"; url: string; name: string; size?: number };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatSize = (bytes?: number) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const parseInitial = (html: string): { text: string; attachments: Attachment[] } => {
  if (!html) return { text: "", attachments: [] };
  if (typeof window === "undefined") return { text: "", attachments: [] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const attachments: Attachment[] = [];
  let i = 0;
  doc.querySelectorAll("img").forEach((el) => {
    const src = el.getAttribute("src");
    if (src) attachments.push({ id: `pre-${i++}`, kind: "image", url: src, name: "image" });
    el.remove();
  });
  doc.querySelectorAll("video").forEach((el) => {
    const src = el.getAttribute("src") || el.querySelector("source")?.getAttribute("src");
    if (src) attachments.push({ id: `pre-${i++}`, kind: "video", url: src, name: "video" });
    el.remove();
  });
  doc.querySelectorAll("a[data-attachment]").forEach((el) => {
    const href = el.getAttribute("href");
    const name = el.getAttribute("data-name") || el.textContent || "file";
    if (href) attachments.push({ id: `pre-${i++}`, kind: "file", url: href, name });
    el.remove();
  });
  const text = (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, attachments };
};

const buildHtml = (text: string, attachments: Attachment[]) => {
  const parts: string[] = [];
  for (const a of attachments) {
    if (a.kind === "image") {
      parts.push(`<p><img src="${escapeHtml(a.url)}" alt="" style="max-width:100%" /></p>`);
    } else if (a.kind === "video") {
      parts.push(`<p><video src="${escapeHtml(a.url)}" controls style="max-width:100%"></video></p>`);
    } else {
      const size = a.size ? ` (${formatSize(a.size)})` : "";
      parts.push(
        `<p><a href="${escapeHtml(a.url)}" data-attachment="1" data-name="${escapeHtml(a.name)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(a.name)}${escapeHtml(size)}</a></p>`,
      );
    }
  }
  const trimmed = text.trim();
  if (trimmed) {
    const safe = escapeHtml(trimmed).replace(/\n/g, "<br />");
    parts.push(`<p>${safe}</p>`);
  }
  return parts.join("");
};

const AnnouncementComposer = ({ productId, initialHtml = "", onSave, onCancel, saving, submitLabel: submitLabelProp }: Props) => {
  const { l } = useLanguage();
  const submitLabel = submitLabelProp ?? l({ ru: "Опубликовать", kk: "Опубликовать", en: "Publish" });
  const initial = parseInitial(initialHtml);
  const [text, setText] = useState(initial.text);
  const [attachments, setAttachments] = useState<Attachment[]>(initial.attachments);
  const [uploading, setUploading] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handlePickFiles = () => fileInputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    for (const file of list) {
      const kind: "image" | "video" | "file" = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      try {
        const url = await uploadAnnouncementMedia(file, productId, kind);
        setAttachments((prev) => [
          ...prev,
          { id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, url, name: file.name, size: file.size } as Attachment,
        ]);
      } catch (e) {
        console.error(e);
        toast.error(l({ ru: `Не удалось загрузить ${file.name}`, kk: `Не удалось загрузить ${file.name}`, en: `Couldn't upload ${file.name}` }));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const canSend = !saving && uploading === 0 && (text.trim().length > 0 || attachments.length > 0);

  const handleSend = async () => {
    if (!canSend) return;
    const html = buildHtml(text, attachments);
    if (!html) return;
    await onSave(html);
  };

  return (
    <div className="border rounded-md bg-background">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 border-b">
          {attachments.map((a) => (
            <div key={a.id} className="relative group">
              {a.kind === "image" ? (
                <img src={a.url} alt="" className="w-20 h-20 object-cover rounded-md border" />
              ) : a.kind === "video" ? (
                <div className="w-20 h-20 rounded-md border bg-muted flex items-center justify-center">
                  <Play className="w-6 h-6 text-muted-foreground" />
                </div>
              ) : (
                <div className="h-20 max-w-[240px] px-3 rounded-md border bg-muted flex items-center gap-2">
                  <FileText className="w-5 h-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{a.name}</div>
                    {"size" in a && a.size ? (
                      <div className="text-[10px] text-muted-foreground">{formatSize(a.size)}</div>
                    ) : null}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shadow"
                aria-label={l({ ru: "Удалить", kk: "Жою", en: "Delete" })}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {uploading > 0 && (
            <div className="w-20 h-20 rounded-md border bg-muted flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}
      <div className="flex items-end gap-1 p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={handlePickFiles}
          disabled={saving}
          title={l({ ru: "Прикрепить файл", kk: "Прикрепить файл", en: "Attach a file" })}
        >
          <Paperclip className="w-5 h-5" />
        </Button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={l({ ru: "Напишите сообщение...", kk: "Напишите сообщение...", en: "Write a message..." })}
          className="flex-1 resize-none bg-transparent outline-none px-2 py-2 text-sm leading-5 max-h-60"
        />
        <Button
          type="button"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={handleSend}
          disabled={!canSend}
          title={submitLabel}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {onCancel && (
        <div className="flex justify-end border-t px-2 py-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            {l({ ru: "Отмена", kk: "Болдырмау", en: "Cancel" })}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AnnouncementComposer;