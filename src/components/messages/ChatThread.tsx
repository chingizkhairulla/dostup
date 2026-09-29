import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, isSameYear, isToday, isYesterday } from "date-fns";
import { kk, ru } from "date-fns/locale";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  SendHorizontal,
  Check,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MediaViewer from "@/components/media/MediaViewer";
import { formatFileSize } from "@/lib/announcementHtml";
import type { ChatAttachment, ChatAttachmentKind } from "@/lib/chatUpload";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  mine: boolean;
  text: string;
  created_at: string;
  attachments?: ChatAttachment[];
  edited?: boolean;
}

/** A file on its way up: its tile carries a cancel button. */
type PendingUpload = {
  id: string;
  name: string;
  kind: ChatAttachmentKind;
  previewUrl?: string;
  controller: AbortController;
};

/** An uploaded file waiting to be sent; the local preview stays so the tile shows the real picture. */
type ReadyAttachment = ChatAttachment & { localId: string; previewUrl?: string };

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  /** Title bar for the "card" variant. */
  title?: ReactNode;
  /** "embedded" drops the card chrome and title bar so the chat fills a messenger pane. */
  variant?: "card" | "embedded";
  canAttach?: boolean;
  uploadFile?: (file: File, kind: ChatAttachmentKind, signal: AbortSignal) => Promise<ChatAttachment>;
  /** Resolves once the message is stored; throws to keep the draft. */
  send: (text: string, attachments: ChatAttachment[]) => Promise<void>;
  /** Own messages get a "⋮" menu with these; throw to keep the message as it was. */
  onEdit?: (messageId: string, text: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  /** Replaces the composer (e.g. "access ended" for a chat that is read-only now). */
  composerNotice?: ReactNode;
}

const MAX_ATTACHMENTS = 10;
const newId = () => `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const kindOf = (file: File, source: "media" | "documents"): ChatAttachmentKind => {
  if (source === "documents") return "file";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
};

/** Message list plus the "+ / field / send" composer shared by every personal chat. */
const ChatThread = ({
  messages,
  loading,
  title,
  variant = "card",
  canAttach = false,
  uploadFile,
  send,
  onEdit,
  onDelete,
  composerNotice,
}: Props) => {
  const { t, language } = useLanguage();
  const locale = language === "kk" ? kk : ru;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<ReadyAttachment[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string; hasFiles: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ items: { kind: "image" | "video"; url: string; name: string }[]; index: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const draft = useRef<string | null>(null);

  // Opens on the newest message and follows new ones while their photos load; a background
  // refresh with nothing new leaves the view alone.
  useStickToBottom(!loading, "chat", messages.length, scrollRef);

  const days = useMemo(() => {
    const groups: { key: string; date: Date; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const date = new Date(m.created_at);
      const key = format(date, "yyyy-MM-dd");
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(m);
      else groups.push({ key, date, items: [m] });
    }
    return groups;
  }, [messages]);

  const dayLabel = (date: Date) => {
    if (isToday(date)) return t("announcementsToday");
    if (isYesterday(date)) return t("announcementsYesterday");
    return format(date, isSameYear(date, new Date()) ? "d MMMM" : "d MMMM yyyy", { locale });
  };

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        p.controller.abort();
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
      for (const a of attachmentsRef.current) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    },
    [],
  );

  const removeAttachment = (localId: string) =>
    setAttachments((prev) => {
      const gone = prev.find((a) => a.localId === localId);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((a) => a.localId !== localId);
    });

  const handleFiles = async (files: FileList | null, source: "media" | "documents") => {
    if (!files?.length || !uploadFile) return;
    const room = MAX_ATTACHMENTS - attachments.length - pending.length;
    const list = Array.from(files).slice(0, Math.max(room, 0));
    if (list.length < files.length) toast.error(t("announcementTooManyFiles", { count: MAX_ATTACHMENTS }));
    if (!list.length) return;

    await Promise.all(
      list.map(async (file) => {
        const kind = kindOf(file, source);
        const entry: PendingUpload = {
          id: newId(),
          name: file.name,
          kind,
          previewUrl: kind === "file" ? undefined : URL.createObjectURL(file),
          controller: new AbortController(),
        };
        setPending((prev) => [...prev, entry]);
        let kept = false;
        try {
          const attachment = await uploadFile(file, kind, entry.controller.signal);
          if (entry.controller.signal.aborted) return;
          // The uploaded tile keeps the local preview, so the picture never blinks to an icon.
          setAttachments((prev) => [...prev, { ...attachment, localId: newId(), previewUrl: entry.previewUrl }]);
          kept = true;
        } catch (e) {
          // Cancelling is not a failure — the tile simply disappears.
          if (!entry.controller.signal.aborted) {
            console.error(e);
            toast.error(t("announcementUploadError", { name: file.name }));
          }
        } finally {
          setPending((prev) => prev.filter((p) => p.id !== entry.id));
          if (!kept && entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        }
      }),
    );
  };

  const startEdit = (m: ChatMessage) => {
    if (!editing) draft.current = text;
    setEditing({ id: m.id, text: m.text, hasFiles: (m.attachments?.length ?? 0) > 0 });
    setText(m.text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const stopEdit = () => {
    setEditing(null);
    setText(draft.current ?? "");
    draft.current = null;
  };

  const canSend = editing
    ? !sending && (text.trim().length > 0 || editing.hasFiles) && text.trim() !== editing.text.trim()
    : !sending && pending.length === 0 && (text.trim().length > 0 || attachments.length > 0);

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      if (editing && onEdit) {
        await onEdit(editing.id, text.trim());
        stopEdit();
      } else {
        await send(text.trim(), attachments.map(({ localId: _localId, url: _url, previewUrl: _preview, ...a }) => a));
        for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        setText("");
        setAttachments([]);
      }
    } catch (e) {
      console.error(e);
      toast.error(t(editing ? "chatEditError" : "chatSendError"));
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId || !onDelete) return;
    const id = deletingId;
    setDeletingId(null);
    if (editing?.id === id) stopEdit();
    try {
      await onDelete(id);
    } catch (e) {
      console.error(e);
      toast.error(t("chatEditError"));
    }
  };

  const openMedia = (list: ChatAttachment[], attachment: ChatAttachment) => {
    const items = list
      .filter((a) => (a.kind === "image" || a.kind === "video") && a.url)
      .map((a) => ({ kind: a.kind as "image" | "video", url: a.url!, name: a.name }));
    const index = items.findIndex((i) => i.url === attachment.url);
    if (index >= 0) setViewer({ items, index });
  };

  const viewerItems = useMemo(() => viewer?.items ?? [], [viewer]);
  const hasActions = !!(onEdit || onDelete);
  const hasStrip = !editing && (attachments.length > 0 || pending.length > 0);

  return (
    <div
      className={
        variant === "embedded"
          ? "flex h-full flex-col bg-transparent"
          : "flex flex-col h-[70vh] max-h-[70vh] border rounded-lg bg-card"
      }
    >
      {variant === "card" && title && <div className="px-4 py-3 border-b font-semibold">{title}</div>}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        <div>
          {loading ? (
            <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm pt-8">{t("chatEmpty")}</div>
          ) : (
            days.map((day) => (
              // Like the channels: each day is a block, and its date sticks on top while it is on screen.
              <section key={day.key} className="space-y-2 pb-2">
                <div className="pointer-events-none sticky top-0 z-[1] flex justify-center py-1">
                  <span className="rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                    {dayLabel(day.date)}
                  </span>
                </div>
                {day.items.map((m) => (
                  <div
                    key={m.id}
                    className={cn("group flex items-start gap-1", m.mine ? "justify-end" : "justify-start")}
                  >
                    {m.mine && hasActions && (
                      <MessageActions
                        canEdit={!!onEdit && m.text.trim().length > 0}
                        canDelete={!!onDelete}
                        onEdit={() => startEdit(m)}
                        onDelete={() => setDeletingId(m.id)}
                      />
                    )}
                    <div
                      className={cn(
                        "max-w-[75%] space-y-2 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                        m.mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                        editing?.id === m.id && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
                      )}
                    >
                      {m.attachments?.map((a) => (
                        <MessageAttachment
                          key={a.path}
                          attachment={a}
                          mine={m.mine}
                          onOpen={() => openMedia(m.attachments ?? [], a)}
                        />
                      ))}
                      {m.text && <div>{m.text}</div>}
                      <div
                        className={cn(
                          "flex justify-end gap-1.5 text-[11px] leading-none",
                          m.mine ? "text-primary-foreground/75" : "text-muted-foreground",
                        )}
                      >
                        {m.edited && <span>{t("announcementEdited")}</span>}
                        <time dateTime={m.created_at}>{format(new Date(m.created_at), "HH:mm")}</time>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </div>

      {composerNotice ? (
        <div className="border-t p-3">{composerNotice}</div>
      ) : (
        // One panel: the file tiles sit inside it, above the field, never on its border.
        <div className="border-t">
          {editing && (
            <div className="flex items-center gap-3 px-3 pt-3">
              <Pencil className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
                <p className="text-xs font-semibold text-primary">{t("announcementEditing")}</p>
                <p className="truncate text-xs text-muted-foreground">{editing.text.split("\n")[0]}</p>
              </div>
              <button
                type="button"
                onClick={stopEdit}
                disabled={sending}
                aria-label={t("cancel")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {hasStrip && (
            <div className="flex gap-2 overflow-x-auto px-3 pt-3">
              {attachments.map((a) => (
                <div key={a.localId} className="relative shrink-0 pr-1.5 pt-1.5">
                  <AttachmentTile kind={a.kind} name={a.name} size={a.size} previewUrl={a.previewUrl} />
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.localId)}
                    aria-label={t("announcementRemoveAttachment")}
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {pending.map((p) => (
                <div key={p.id} className="relative shrink-0 pr-1.5 pt-1.5">
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
                    <span className={cn("absolute inset-0 flex items-center justify-center", p.previewUrl && "bg-black/40")}>
                      <Loader2 className={cn("h-5 w-5 animate-spin", p.previewUrl ? "text-white" : "text-muted-foreground")} />
                    </span>
                  </div>
                  {/* Available while the file uploads, so a big video can be called off. */}
                  <button
                    type="button"
                    onClick={() => p.controller.abort()}
                    aria-label={t("announcementCancelUpload")}
                    title={t("announcementCancelUpload")}
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 p-3">
            {canAttach && uploadFile && !editing && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-transparent data-[state=open]:text-muted-foreground"
                    disabled={sending}
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
            )}
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && editing) {
                  e.preventDefault();
                  stopEdit();
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={t("chatPlaceholder")}
              disabled={sending}
            />
            <Button
              onClick={() => void submit()}
              disabled={!canSend}
              size="icon"
              className="shrink-0 rounded-full"
              aria-label={editing ? t("announcementSave") : t("announcementSend")}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editing ? (
                <Check className="w-5 h-5" />
              ) : (
                <SendHorizontal className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      )}

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

      <MediaViewer
        items={viewerItems}
        index={viewer?.index ?? null}
        onIndexChange={(index) => setViewer((v) => (index === null || !v ? null : { ...v, index }))}
        light
      />

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chatDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("chatDeleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** "⋮" beside an own message, the same menu the channels have. */
const MessageActions = ({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("announcementActions")}
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-background hover:text-foreground focus-ring data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {/* Keep focus in the field when "Edit" loads the message into it. */}
      <DropdownMenuContent align="end" className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        {canEdit && (
          <DropdownMenuItem className="gap-2" onSelect={onEdit}>
            <Pencil className="h-4 w-4" />
            {t("edit")}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            {t("delete")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const AttachmentTile = ({
  kind,
  name,
  size,
  previewUrl,
}: {
  kind: ChatAttachmentKind;
  name: string;
  size: number;
  previewUrl?: string;
}) => {
  if (kind === "file") {
    return (
      <div className="flex h-20 w-44 items-center gap-2 rounded-xl border bg-muted px-3">
        <FileText className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{name}</p>
          <p className="text-[11px] text-muted-foreground">{formatFileSize(size)}</p>
        </div>
      </div>
    );
  }
  if (previewUrl) {
    return (
      <div className="relative h-20 w-20 overflow-hidden rounded-xl border bg-muted">
        {kind === "video" ? (
          <>
            <video src={previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
                <Play className="h-3.5 w-3.5 fill-current" />
              </span>
            </span>
          </>
        ) : (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
    );
  }
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
      {kind === "video" ? <Play className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
    </div>
  );
};

const MessageAttachment = ({
  attachment,
  mine,
  onOpen,
}: {
  attachment: ChatAttachment;
  mine: boolean;
  onOpen: () => void;
}) => {
  if (!attachment.url) {
    return (
      <div className="flex h-20 w-full items-center justify-center rounded-lg bg-black/10">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (attachment.kind === "image") {
    return (
      <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-lg focus-ring">
        <img src={attachment.url} alt={attachment.name} loading="lazy" className="max-h-64 w-full object-cover" />
      </button>
    );
  }
  if (attachment.kind === "video") {
    return (
      <button type="button" onClick={onOpen} className="relative block w-full overflow-hidden rounded-lg bg-black focus-ring">
        <video src={`${attachment.url}#t=0.1`} muted playsInline preload="metadata" className="max-h-64 w-full object-cover" />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </span>
      </button>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
        mine ? "bg-white/15 hover:bg-white/25" : "bg-background hover:bg-background/70",
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{attachment.name}</span>
        <span className="block text-[11px] opacity-70">{formatFileSize(attachment.size)}</span>
      </span>
    </a>
  );
};

export default ChatThread;
