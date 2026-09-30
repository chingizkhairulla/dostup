import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FileText, Image as ImageIcon, Loader2, Play, Plus, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  mine: boolean;
  text: string;
  created_at: string;
  attachments?: ChatAttachment[];
}

/** A file on its way up: its tile carries a cancel button. */
type PendingUpload = {
  id: string;
  name: string;
  kind: ChatAttachmentKind;
  previewUrl?: string;
  controller: AbortController;
};

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
  composerNotice,
}: Props) => {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<(ChatAttachment & { localId: string })[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [viewer, setViewer] = useState<{ items: { kind: "image" | "video"; url: string; name: string }[]; index: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const dropPending = (id: string) =>
    setPending((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });

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
        try {
          const attachment = await uploadFile(file, kind, entry.controller.signal);
          if (entry.controller.signal.aborted) return;
          setAttachments((prev) => [...prev, { ...attachment, localId: newId() }]);
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

  const canSend = !sending && pending.length === 0 && (text.trim().length > 0 || attachments.length > 0);

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await send(text.trim(), attachments.map(({ localId: _localId, url: _url, ...a }) => a));
      setText("");
      setAttachments([]);
    } catch (e) {
      console.error(e);
      toast.error(t("chatSendError"));
    } finally {
      setSending(false);
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

  return (
    <div
      className={
        variant === "embedded"
          ? "flex h-full flex-col bg-transparent"
          : "flex flex-col h-[70vh] max-h-[70vh] border rounded-lg bg-card"
      }
    >
      {variant === "card" && title && <div className="px-4 py-3 border-b font-semibold">{title}</div>}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm pt-8">{t("chatEmpty")}</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] space-y-2 px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${m.mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                {m.attachments?.map((a) => (
                  <MessageAttachment
                    key={a.path}
                    attachment={a}
                    mine={m.mine}
                    onOpen={() => openMedia(m.attachments ?? [], a)}
                  />
                ))}
                {m.text}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {(attachments.length > 0 || pending.length > 0) && (
        <div className="flex gap-2 overflow-x-auto border-t px-3 pt-3">
          {attachments.map((a) => (
            <div key={a.localId} className="relative shrink-0">
              <AttachmentTile kind={a.kind} name={a.name} size={a.size} />
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.localId !== a.localId))}
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
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {composerNotice ? (
        <div className="border-t p-3">{composerNotice}</div>
      ) : (
        <div className="border-t p-3 flex items-center gap-2">
          {canAttach && uploadFile && (
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            placeholder={t("chatPlaceholder")}
            disabled={sending}
          />
          <Button onClick={() => void submit()} disabled={!canSend} size="icon" className="shrink-0 rounded-full">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-5 h-5" />}
          </Button>
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
      />
    </div>
  );
};

const AttachmentTile = ({ kind, name, size }: { kind: ChatAttachmentKind; name: string; size: number }) =>
  kind === "file" ? (
    <div className="flex h-20 w-44 items-center gap-2 rounded-xl border bg-muted px-3">
      <FileText className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{name}</p>
        <p className="text-[11px] text-muted-foreground">{formatFileSize(size)}</p>
      </div>
    </div>
  ) : (
    <div className="flex h-20 w-20 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
      {kind === "video" ? <Play className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
    </div>
  );

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
