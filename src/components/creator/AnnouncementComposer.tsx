import { useEffect, useRef, useState } from "react";
import { Check, FileText, Image as ImageIcon, Loader2, Pencil, Play, Plus, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadAnnouncementMedia } from "@/hooks/useAnnouncements";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { buildAnnouncementHtml, formatFileSize, type AnnouncementAttachment } from "@/lib/announcementHtml";
import { parseAnnouncement } from "@/components/announcements/parseAnnouncement";
import { FileDropZone } from "@/components/messages/FileDropZone";
import { chatFileError, MAX_CHAT_ATTACHMENTS } from "@/lib/chatFiles";

const MAX_ATTACHMENTS = MAX_CHAT_ATTACHMENTS;

type LocalAttachment = AnnouncementAttachment & { id: string };

type AttachmentKind = "image" | "video" | "file";

/** A file on its way up: shown as a tile with its own cancel button. */
type PendingUpload = {
  id: string;
  name: string;
  kind: AttachmentKind;
  /** Local object URL, so the tile shows the real photo/video while it uploads. */
  previewUrl?: string;
  controller: AbortController;
};

interface Props {
  productId: string;
  /** Post being edited; its text and attachments replace the draft until saved or cancelled. */
  editing?: { id: string; html: string } | null;
  onCancelEdit?: () => void;
  /** Resolves true when the post was saved, so the field can be cleared. */
  onSubmit: (html: string) => Promise<boolean>;
  saving?: boolean;
  /** Allows an isolated preview to use local files without contacting storage. */
  uploadMedia?: typeof uploadAnnouncementMedia;
}

const newId = () => `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const fromHtml = (html: string) => {
  const parsed = parseAnnouncement(html);
  const attachments: LocalAttachment[] = [
    ...parsed.media.map((m) => ({ ...m, id: newId() })),
    ...parsed.files.map((f) => ({ kind: "file" as const, ...f, id: newId() })),
  ];
  return { text: parsed.text, attachments };
};

// On phones Enter adds a new line, like in messengers; on a keyboard it sends.
const enterSends = () => typeof window !== "undefined" && !window.matchMedia?.("(pointer: coarse)").matches;

/** Telegram-like input for a read-only channel: text, photos/videos and documents. No links outside the text. */
const AnnouncementComposer = ({ productId, editing, onCancelEdit, onSubmit, saving, uploadMedia = uploadAnnouncementMedia }: Props) => {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const current = useRef({ text, attachments });
  current.current = { text, attachments };
  const draft = useRef<{ text: string; attachments: LocalAttachment[] } | null>(null);
  const submittingRef = useRef(false);

  const editingId = editing?.id ?? null;
  const editingHtml = editing?.html ?? "";
  useEffect(() => {
    if (editingId) {
      // Keep whatever was typed before, and bring it back after editing.
      if (!draft.current) draft.current = current.current;
      const loaded = fromHtml(editingHtml);
      setText(loaded.text);
      setAttachments(loaded.attachments);
      textareaRef.current?.focus();
    } else if (draft.current) {
      setText(draft.current.text);
      setAttachments(draft.current.attachments);
      draft.current = null;
    }
  }, [editingId, editingHtml]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        p.controller.abort();
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    },
    [],
  );

  const dropPending = (id: string) => {
    pendingRef.current = pendingRef.current.filter((p) => p.id !== id);
    setPending((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleFiles = async (files: FileList | File[] | null, source: "media" | "documents") => {
    if (!files?.length || saving || submittingRef.current) return;
    const room = MAX_ATTACHMENTS - current.current.attachments.length - pendingRef.current.length;
    const list = Array.from(files).slice(0, Math.max(room, 0));
    if (list.length < files.length) toast.error(t("announcementTooManyFiles", { count: MAX_ATTACHMENTS }));
    if (!list.length) return;
    await Promise.all(
      list.map(async (file) => {
        const error = chatFileError(file);
        if (error) { toast.error(`${file.name}: ${error}`); return; }
        const kind: AttachmentKind =
          source === "documents"
            ? "file"
            : file.type.startsWith("image/")
              ? "image"
              : file.type.startsWith("video/")
                ? "video"
                : "file";
        const entry: PendingUpload = {
          id: newId(),
          name: file.name,
          kind,
          previewUrl: kind === "file" ? undefined : URL.createObjectURL(file),
          controller: new AbortController(),
        };
        pendingRef.current = [...pendingRef.current, entry];
        setPending(pendingRef.current);
        try {
          const url = await uploadMedia(file, productId, kind, entry.controller.signal);
          if (entry.controller.signal.aborted) return;
          const attachment: LocalAttachment =
            kind === "file" ? { id: newId(), kind, url, name: file.name, size: file.size } : { id: newId(), kind, url };
          current.current = { ...current.current, attachments: [...current.current.attachments, attachment] };
          setAttachments(current.current.attachments);
        } catch (e) {
          // Cancelling is not a failure — the tile simply disappears.
          if (!entry.controller.signal.aborted) {
            console.error(e);
            toast.error(t("announcementUploadError", { name: file.name }));
          }
        } finally {
          dropPending(entry.id);
        }
      }),
    );
  };

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const canSend = !saving && pending.length === 0 && hasContent;

  const submit = async () => {
    if (!canSend || submittingRef.current || pendingRef.current.length) return;
    const html = buildAnnouncementHtml(
      text,
      attachments.map(({ id: _id, ...attachment }) => attachment),
    );
    if (!html) {
      toast.error(t("announcementEmpty"));
      return;
    }
    submittingRef.current = true;
    let ok = false;
    try { ok = await onSubmit(html); } finally { submittingRef.current = false; }
    if (ok && !editingId) {
      setText("");
      setAttachments([]);
      textareaRef.current?.focus();
    }
  };

  const editPreview = editing ? parseAnnouncement(editing.html).text.split("\n")[0] : "";

  return (
    // Same look as the support chat's input row: "+" on the left, a plain field, a round send button.
    <FileDropZone enabled={!saving} onFiles={(files) => void handleFiles(files, "media")} className="bg-background">
      {editing && (
        <div className="flex items-center gap-3 px-1 pb-2">
          <Pencil className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
            <p className="text-xs font-semibold text-primary">{t("announcementEditing")}</p>
            {editPreview && <p className="truncate text-xs text-muted-foreground">{editPreview}</p>}
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={saving}
            aria-label={t("cancel")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(attachments.length > 0 || pending.length > 0) && (
        <div className="flex gap-2 overflow-x-auto px-1 pb-3 pt-1.5">
          {attachments.map((a) => (
            <div key={a.id} className="relative shrink-0">
              {a.kind === "image" ? (
                <img src={a.url} alt="" className="h-20 w-20 rounded-xl border object-cover" />
              ) : a.kind === "video" ? (
                <div className="relative h-20 w-20 overflow-hidden rounded-xl border bg-black">
                  {/* preload="metadata" paints the first frame, so the cover shows instead of a blank tile. */}
                  <video
                    src={`${a.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </span>
                  </span>
                </div>
              ) : (
                <div className="flex h-20 w-44 items-center gap-2 rounded-xl border bg-muted px-3">
                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{a.name}</p>
                    {a.size !== undefined && (
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(a.size)}</p>
                    )}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                aria-label={t("announcementRemoveAttachment")}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.id} className="relative shrink-0">
              <div className="relative h-20 w-20 overflow-hidden rounded-xl border bg-muted">
                {p.previewUrl && p.kind === "image" && (
                  <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
                {p.previewUrl && p.kind === "video" && (
                  <video src={p.previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                )}
                {p.kind === "file" && (
                  <span className="flex h-full w-full items-center justify-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </span>
                )}
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center",
                    p.previewUrl && "bg-black/40",
                  )}
                >
                  <Loader2
                    className={cn("h-5 w-5 animate-spin", p.previewUrl ? "text-white" : "text-muted-foreground")}
                  />
                </span>
              </div>
              {/* Available while the file uploads, so a big video can be called off. */}
              <button
                type="button"
                onClick={() => p.controller.abort()}
                aria-label={t("announcementCancelUpload")}
                title={t("announcementCancelUpload")}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-transparent data-[state=open]:text-muted-foreground"
              disabled={saving}
              aria-label={t("announcementAttach")}
              title={t("announcementAttach")}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-[200px]">
            <DropdownMenuItem className="group gap-3 py-2.5" onSelect={() => mediaInputRef.current?.click()}>
              <ImageIcon className="h-4 w-4 text-primary transition-colors group-focus:text-inherit group-data-[highlighted]:text-inherit" />
              {t("announcementAttachMedia")}
            </DropdownMenuItem>
            <DropdownMenuItem className="group gap-3 py-2.5" onSelect={() => docInputRef.current?.click()}>
              <FileText className="h-4 w-4 text-primary transition-colors group-focus:text-inherit group-data-[highlighted]:text-inherit" />
              {t("announcementAttachDocuments")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && editing) {
              e.preventDefault();
              onCancelEdit?.();
            } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={t("announcementPlaceholder")}
          aria-label={t("announcementPlaceholder")}
          className="min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2.5 text-base leading-5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
        />

        <Button
          type="button"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label={editing ? t("announcementSave") : t("announcementSend")}
          title={editing ? t("announcementSave") : t("announcementSend")}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : editing ? (
            <Check className="h-5 w-5" />
          ) : (
            <SendHorizontal className="h-5 w-5" />
          )}
        </Button>
      </div>

      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files, "media");
          e.target.value = "";
        }}
      />
      <input
        ref={docInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files, "documents");
          e.target.value = "";
        }}
      />
    </FileDropZone>
  );
};

export default AnnouncementComposer;
