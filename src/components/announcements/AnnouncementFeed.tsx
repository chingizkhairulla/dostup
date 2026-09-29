import { useMemo, useState, type ReactNode } from "react";
import { format, isSameYear, isToday, isYesterday } from "date-fns";
import { kk, ru } from "date-fns/locale";
import { FileText, Megaphone, Play } from "lucide-react";
import MediaViewer from "@/components/media/MediaViewer";
import type { Announcement } from "@/hooks/useAnnouncements";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatFileSize } from "@/lib/announcementHtml";
import { cn } from "@/lib/utils";
import { parseAnnouncement, type ParsedAnnouncement } from "./parseAnnouncement";

interface FeedProps {
  announcements: Announcement[];
  emptyText: string;
  /** Author controls shown next to each post (edit / delete). */
  renderActions?: (announcement: Announcement) => ReactNode;
  highlightedId?: string | null;
  /** Overrides the feed container styling — the messenger pane renders it full-bleed. */
  className?: string;
  emptyClassName?: string;
}

const byTime = (a: Announcement, b: Announcement) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.order_index - b.order_index;

/** Channel feed: oldest post on top, newest at the bottom, split by day like Telegram. */
const AnnouncementFeed = ({
  announcements,
  emptyText,
  renderActions,
  highlightedId,
  className,
  emptyClassName,
}: FeedProps) => {
  const { language, t } = useLanguage();
  const locale = language === "kk" ? kk : ru;

  const days = useMemo(() => {
    const groups: { key: string; date: Date; items: Announcement[] }[] = [];
    for (const item of [...announcements].sort(byTime)) {
      const date = new Date(item.created_at);
      const key = format(date, "yyyy-MM-dd");
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(item);
      else groups.push({ key, date, items: [item] });
    }
    return groups;
  }, [announcements]);

  const dayLabel = (date: Date) => {
    if (isToday(date)) return t("announcementsToday");
    if (isYesterday(date)) return t("announcementsYesterday");
    return format(date, isSameYear(date, new Date()) ? "d MMMM" : "d MMMM yyyy", { locale });
  };

  if (days.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl bg-muted/40 px-6 py-12 text-center",
          emptyClassName,
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Megaphone className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 rounded-2xl bg-muted/40 p-3 sm:p-4", className)}>
      {days.map((day) => (
        // Each day is its own block, so its date sticks under the header only while that day is on screen.
        <section key={day.key} className="space-y-2">
          <div className="pointer-events-none sticky top-1 z-[1] flex justify-center py-1">
            <span className="rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              {dayLabel(day.date)}
            </span>
          </div>
          {day.items.map((item) => (
            <div key={item.id} className="group flex items-start gap-1">
              <AnnouncementBubble announcement={item} highlighted={item.id === highlightedId} />
              {renderActions?.(item)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};

const AnnouncementBubble = ({ announcement, highlighted }: { announcement: Announcement; highlighted: boolean }) => {
  const { t } = useLanguage();
  const parsed = useMemo(() => parseAnnouncement(announcement.content_html), [announcement.content_html]);
  const created = new Date(announcement.created_at);
  // The DB stamps both columns on insert, and only an edit moves updated_at forward.
  const edited = new Date(announcement.updated_at).getTime() - created.getTime() > 1000;
  const hasMedia = parsed.media.length > 0;

  return (
    <article
      className={cn(
        "min-w-0 max-w-[min(100%,520px)] overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm transition-shadow",
        hasMedia ? "w-full" : "w-fit",
        highlighted && "ring-2 ring-primary/50",
      )}
    >
      {hasMedia && <MediaGrid media={parsed.media} />}
      <div className="space-y-2 px-3.5 pb-2 pt-2.5">
        {parsed.files.map((file, i) => (
          <a
            key={`${file.url}-${i}`}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 transition-colors hover:bg-muted focus-ring"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{file.name}</span>
              {file.size !== undefined && (
                <span className="block text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              )}
            </span>
          </a>
        ))}
        {parsed.bodyHtml && (
          <div
            className="break-words text-[15px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: parsed.bodyHtml }}
          />
        )}
        <div className="flex justify-end gap-1.5 text-[11px] leading-none text-muted-foreground">
          {edited && <span>{t("announcementEdited")}</span>}
          <time dateTime={announcement.created_at}>{format(created, "HH:mm")}</time>
        </div>
      </div>
    </article>
  );
};

/** Poster tile for a video: its first frame with a play badge; the viewer does the playing. */
const VideoThumb = ({ url, className }: { url: string; className?: string }) => (
  <span className={cn("relative block bg-black", className)}>
    <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
        <Play className="ml-0.5 h-5 w-5 fill-current" />
      </span>
    </span>
  </span>
);

const MediaGrid = ({ media }: { media: ParsedAnnouncement["media"] }) => {
  const [open, setOpen] = useState<number | null>(null);
  const viewer = <MediaViewer items={media} index={open} onIndexChange={setOpen} />;

  if (media.length === 1) {
    const [item] = media;
    return (
      <>
        <button type="button" onClick={() => setOpen(0)} className="block w-full bg-muted focus-ring">
          {item.kind === "video" ? (
            <VideoThumb url={item.url} className="aspect-video max-h-[420px] w-full" />
          ) : (
            <img src={item.url} alt="" loading="lazy" className="block max-h-[420px] w-full object-contain" />
          )}
        </button>
        {viewer}
      </>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-0.5">
        {media.map((item, i) => {
          const wide = media.length % 2 === 1 && i === 0;
          const box = cn("block w-full overflow-hidden", wide ? "col-span-2 aspect-video" : "aspect-square");
          return (
            <button key={`${item.url}-${i}`} type="button" onClick={() => setOpen(i)} className={cn(box, "bg-muted focus-ring")}>
              {item.kind === "video" ? (
                <VideoThumb url={item.url} className="h-full w-full" />
              ) : (
                <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </button>
          );
        })}
      </div>
      {viewer}
    </>
  );
};

export default AnnouncementFeed;
