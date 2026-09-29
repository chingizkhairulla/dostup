import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, ChevronLeft, Loader2, MessagesSquare, Search, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface ChatListItem {
  id: string;
  title: string;
  /** Last message preview or a short description under the title. */
  subtitle?: string;
  /** Sorts the category and feeds the time stamp on the row. */
  timestamp?: number;
  unread?: number;
  icon?: LucideIcon;
  avatarUrl?: string | null;
  /** Rendered in place of the icon circle — used for the Dostup mark. */
  avatar?: ReactNode;
  /** Orange check after the title. */
  verified?: boolean;
  /** Keys of the category filters this chat shows under (see ChatCategory.filters). */
  filterKeys?: string[];
  /** Shown under every filter — the support chat. */
  pinned?: boolean;
}

export interface ChatCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  items: ChatListItem[];
  emptyText?: string;
  /** Second row of chips inside the category; the first one is selected by default. */
  filters?: { key: string; label: string }[];
}

interface Props {
  categories: ChatCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Top bar of the conversation pane — the channel/person name lives here. */
  header?: ReactNode;
  /** Scrollable conversation body. */
  children?: ReactNode;
  /** Composer pinned under the conversation. */
  footer?: ReactNode;
  loading?: boolean;
  /** Extra ref hook for the scrollable conversation body. */
  bodyRef?: React.RefObject<HTMLDivElement>;
}

const initialsFrom = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase() || "•";

const timeLabel = (ts?: number) => {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
};

/**
 * Two-pane messenger: chat list on the left (search, then a row of category chips the way a
 * messenger filters its list), the open conversation on the right. On phones only one pane
 * shows at a time.
 */
const MessengerLayout = ({
  categories,
  selectedId,
  onSelect,
  header,
  children,
  footer,
  loading,
  bodyRef,
}: Props) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState(categories[0]?.key ?? "");
  // Phones show one pane at a time; picking a chat slides the conversation in.
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");

  const active = categories.find((category) => category.key === activeKey) ?? categories[0];
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const filters = active?.filters ?? [];
  const activeFilter = filters.find((f) => f.key === filterKey) ?? filters[0];

  // A chip that goes away must not leave the list pinned to a category that no longer exists.
  useEffect(() => {
    if (categories.length && !categories.some((category) => category.key === activeKey)) {
      setActiveKey(categories[0].key);
    }
  }, [categories, activeKey]);

  const items = useMemo(() => {
    const all = active?.items ?? [];
    const list = activeFilter
      ? all.filter((item) => item.pinned || item.filterKeys?.includes(activeFilter.key))
      : all;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => item.title.toLowerCase().includes(q));
  }, [active, activeFilter, query]);

  useEffect(() => {
    if (!selectedId) setMobilePane("list");
  }, [selectedId]);

  // A hidden pane has no height, so the feed's own scroll-to-bottom does nothing while the
  // phone shows the list. Land on the newest message when the conversation comes into view.
  useEffect(() => {
    const pane = bodyRef?.current;
    if (!pane || !selectedId || mobilePane !== "chat") return;
    const toBottom = () => {
      pane.scrollTop = pane.scrollHeight;
    };
    const frame = requestAnimationFrame(toBottom);
    const observer = new ResizeObserver(toBottom);
    if (pane.firstElementChild) observer.observe(pane.firstElementChild);
    const timer = window.setTimeout(() => observer.disconnect(), 1500);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [mobilePane, selectedId, bodyRef]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col border-border md:w-[320px] md:border-r lg:w-[340px]",
          mobilePane === "chat" && "hidden md:flex",
        )}
      >
        <div className="shrink-0 px-4 pb-3 pt-4">
          <h2 className="mb-3 text-lg font-semibold text-foreground">{t("messages")}</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("messagesSearchPlaceholder")}
              aria-label={t("messagesSearchPlaceholder")}
              className="h-10 w-full rounded-full border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2" role="tablist">
            {categories.map((category) => {
              const CategoryIcon = category.icon;
              const isActive = category.key === active?.key;
              return (
                <button
                  key={category.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveKey(category.key);
                    setFilterKey(null);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/15 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <CategoryIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{category.label}</span>
                </button>
              );
            })}
          </div>

          {filters.length > 1 && (
            <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4" role="tablist">
              {filters.map((filter) => {
                const isActive = filter.key === activeFilter?.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setFilterKey(filter.key)}
                    title={filter.label}
                    className={cn(
                      // About as wide as the word "Продукты"; longer product names are cut short.
                      "max-w-[5.5rem] shrink-0 truncate rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="app-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {query.trim() ? t("messagesNothingFound") : active?.emptyText ?? t("messagesNoChannels")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => {
                const ItemIcon = item.icon;
                const isOpen = item.id === selectedId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(item.id);
                        setMobilePane("chat");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
                        isOpen ? "bg-primary/10" : "hover:bg-muted/60",
                      )}
                    >
                      {item.avatar ?? (
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
                            isOpen ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {item.avatarUrl ? (
                            <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : ItemIcon ? (
                            <ItemIcon className="h-5 w-5" strokeWidth={1.75} />
                          ) : (
                            initialsFrom(item.title)
                          )}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "min-w-0 truncate text-sm font-medium",
                              isOpen ? "text-primary" : "text-foreground",
                            )}
                          >
                            {item.title}
                          </span>
                          {/* Right after the name; the far right is where the time goes. */}
                          {item.verified && (
                            <BadgeCheck className="h-4 w-4 shrink-0 text-[#FF6B00]" strokeWidth={2} />
                          )}
                          {item.timestamp ? (
                            <span className="ml-auto shrink-0 pl-1 text-[11px] text-muted-foreground">
                              {timeLabel(item.timestamp)}
                            </span>
                          ) : null}
                        </span>
                        {item.subtitle && (
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {item.subtitle}
                            </span>
                            {item.unread ? (
                              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                {item.unread > 9 ? "9+" : item.unread}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col", mobilePane === "list" && "hidden md:flex")}
      >
        {selectedId ? (
          <>
            <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border px-2 py-2 md:px-4">
              <button
                type="button"
                onClick={() => setMobilePane("list")}
                aria-label={t("messagesBackToList")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} />
              </button>
              <div className="min-w-0 flex-1">{header}</div>
            </div>
            <div ref={bodyRef} className="app-scroll min-h-0 flex-1 overflow-y-auto bg-muted/30">
              {children}
            </div>
            {footer && <div className="shrink-0 border-t border-border bg-background p-3">{footer}</div>}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessagesSquare className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">{t("messagesPickChat")}</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default MessengerLayout;
