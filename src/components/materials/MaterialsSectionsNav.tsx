import { Check, ChevronDown, Library, Star, Trash2, HardDrive } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRef, useLayoutEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MaterialsSection = "library" | "bookmarks" | "trash" | "storage";

interface Props {
  value: MaterialsSection;
  onChange: (v: MaterialsSection) => void;
  addButton?: ReactNode;
  showAdd?: boolean;
  showTrash?: boolean;
  trashCount?: number;
  showStorage?: boolean;
}

export const MaterialsSectionsNav = ({
  value,
  onChange,
  addButton,
  showAdd = true,
  showTrash = false,
  trashCount = 0,
  showStorage = false,
}: Props) => {
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const phantomRef = useRef<HTMLDivElement>(null);
  const [iconsOnly, setIconsOnly] = useState(isMobile);

  const items: { key: MaterialsSection; label: string; icon: typeof Library }[] = [
    { key: "library", label: language === "kk" ? "Кітапхана" : "Библиотека", icon: Library },
    { key: "bookmarks", label: language === "kk" ? "Белгіленгендер" : "Помеченные", icon: Star },
  ];
  if (showTrash) {
    items.push({ key: "trash", label: language === "kk" ? "Себет" : "Корзина", icon: Trash2 });
  }
  if (showStorage) {
    items.push({ key: "storage", label: language === "kk" ? "Қойма" : "Хранилище", icon: HardDrive });
  }

  useLayoutEffect(() => {
    if (isMobile) {
      setIconsOnly(true);
      return;
    }
    const container = containerRef.current;
    const phantom = phantomRef.current;
    if (!container || !phantom) return;
    const check = () => {
      const available = container.clientWidth;
      const needed = phantom.scrollWidth;
      setIconsOnly(needed > available + 1);
    };
    const ro = new ResizeObserver(check);
    ro.observe(container);
    ro.observe(phantom);
    check();
    return () => ro.disconnect();
  }, [items.length, language, trashCount, showAdd, isMobile]);

  const renderItemButton = (it: typeof items[number], compact: boolean) => {
    const Icon = it.icon;
    const active = value === it.key;
    return (
      <button
        key={it.key}
        onClick={() => onChange(it.key)}
        title={compact ? it.label : undefined}
        aria-label={compact ? it.label : undefined}
        className={`relative inline-flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap ${
          compact ? "w-9 px-0" : "px-3"
        } ${
          active
            ? "bg-primary/15 text-primary border-primary/30"
            : "bg-background text-muted-foreground border-input hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="w-4 h-4" />
        {!compact && <span>{it.label}</span>}
        {it.key === "trash" && trashCount > 0 && !compact && (
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-orange-500 text-white font-semibold">
            {trashCount}
          </span>
        )}
        {it.key === "trash" && trashCount > 0 && compact && (
          <span className="absolute -top-1 -right-1 text-[10px] min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-white font-semibold flex items-center justify-center">
            {trashCount}
          </span>
        )}
      </button>
    );
  };

  if (isMobile && showTrash && showStorage) {
    const current = items.find((item) => item.key === value) ?? items[0];
    const CurrentIcon = current.icon;
    return (
      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="relative h-9 gap-1 px-2"
              aria-label={current.label}
              title={current.label}
            >
              <CurrentIcon className="h-4 w-4" />
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              {current.key === "trash" && trashCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                  {trashCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.key}
                  onClick={() => onChange(item.key)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.key === "trash" && trashCount > 0 && (
                    <span className="text-xs text-muted-foreground">{trashCount}</span>
                  )}
                  <Check className={`h-4 w-4 ${value === item.key ? "opacity-100" : "opacity-0"}`} />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {showAdd && addButton}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-end gap-2 w-full min-w-0 overflow-hidden"
    >
      {/* Phantom: measures full-label width to decide when to collapse to icons */}
      <div
        ref={phantomRef}
        aria-hidden="true"
        className="absolute left-0 top-0 flex items-center gap-2 pointer-events-none opacity-0"
        style={{ visibility: "hidden" }}
      >
        {items.map((it) => renderItemButton(it, false))}
        {showAdd && addButton}
      </div>

      {items.map((it) => renderItemButton(it, iconsOnly))}
      {showAdd && addButton}
    </div>
  );
};

export default MaterialsSectionsNav;
