import { Check, ChevronDown, Eye, EyeOff, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export type VisibilityState = "private" | "published" | "paused";

/**
 * Derives the single visibility state from the two underlying flags.
 * `is_active: false` hides the product entirely (dead link); `is_paused` keeps
 * the link alive but shows the author's message instead of a buy button.
 */
export function visibilityState(product: {
  is_active?: boolean;
  is_paused?: boolean;
}): VisibilityState {
  if (product.is_active === false) return "private";
  return product.is_paused ? "paused" : "published";
}

const ICONS = {
  private: EyeOff,
  published: Eye,
  paused: PauseCircle,
} as const;

type ProductVisibilityMenuProps = {
  state: VisibilityState;
  isMobile?: boolean;
  onSelect: (next: VisibilityState) => void;
};

const ProductVisibilityMenu = ({ state, isMobile, onSelect }: ProductVisibilityMenuProps) => {
  const { t } = useLanguage();
  const CurrentIcon = ICONS[state];

  const options: Array<{ value: VisibilityState; label: string }> = [
    { value: "private", label: t("visibilityPrivate") },
    { value: "published", label: t("visibilityPublished") },
    { value: "paused", label: t("visibilityPaused") },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={isMobile ? "h-8 px-2 text-xs" : "h-9"}>
          <CurrentIcon className="w-3.5 h-3.5" />
          <span className="ml-1">{t("visibilityLabel")}</span>
          <ChevronDown className="ml-1 w-3.5 h-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              if (option.value !== state) onSelect(option.value);
            }}
            className="flex items-center gap-2"
          >
            <Check
              className={cn(
                "h-4 w-4 shrink-0",
                option.value === state ? "opacity-100" : "opacity-0",
              )}
            />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProductVisibilityMenu;
