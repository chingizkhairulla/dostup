import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronRight, Package, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductOption { id: string; title: string; }

interface Props {
  products: ProductOption[];
  selectedId: string | null;
  onChange: (id: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  hideIcon?: boolean;
<<<<<<< Updated upstream
}

const ProductSwitcher = ({ products, selectedId, onChange, className, placeholder, disabled, hideIcon }: Props) => {
=======
  /** Dimmed while another filter ("all products") is on: a tap picks the shown product instead of opening the list. */
  inactive?: boolean;
  active?: boolean;
}

const ProductSwitcher = ({ products, selectedId, onChange, className, placeholder, disabled, hideIcon, inactive = false, active = false }: Props) => {
>>>>>>> Stashed changes
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === selectedId);
  const displayTitle = selected ? selected.title : (placeholder || products[0]?.title || "");
  if (!selected && !placeholder && !products[0]) return null;

  const isSingle = products.length <= 1;

  if (isSingle) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={cn(
          "group gap-2 max-w-full font-medium cursor-default",
          active
            ? "border-primary bg-primary text-white hover:bg-primary/90 hover:text-white hover:border-primary"
            : "border-input bg-background text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
          className
        )}
        title={displayTitle}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!hideIcon && (
            <Package
              className={cn(
                "w-4 h-4 flex-shrink-0 transition-colors",
                active ? "text-white" : "text-primary group-hover:text-primary"
              )}
            />
          )}
          <span className="truncate text-left">{displayTitle}</span>
        </div>
      </Button>
    );
  }

<<<<<<< Updated upstream
=======
  const shown = selected ?? products[0];
  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className={cn(
        "group gap-2 max-w-full font-medium",
        active
          ? "border-primary bg-primary text-white hover:bg-primary/90 hover:text-white hover:border-primary"
          : "border-input bg-background text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
        className
      )}
      title={displayTitle}
      onClick={inactive && shown ? () => onChange(shown.id) : undefined}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {!hideIcon && (
          <Package
            className={cn(
              "w-4 h-4 flex-shrink-0 transition-colors",
              active ? "text-white" : "text-primary group-hover:text-primary"
            )}
          />
        )}
        <span className="truncate text-left">{displayTitle}</span>
      </div>
      <ChevronRight
        className={cn(
          "w-4 h-4 flex-shrink-0 transition-transform duration-200 ml-auto",
          active ? "text-white/80" : "opacity-60 group-hover:text-primary group-hover:opacity-100",
          open && "rotate-90"
        )}
      />
    </Button>
  );

  if (inactive) return trigger;

>>>>>>> Stashed changes
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("group gap-2 max-w-full font-medium", className)}
          title={displayTitle}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!hideIcon && <Package className="w-4 h-4 text-primary flex-shrink-0 transition-colors group-hover:text-inherit" />}
            <span className="truncate text-left">{displayTitle}</span>
          </div>
          <ChevronRight className={cn("w-4 h-4 flex-shrink-0 opacity-60 transition-transform duration-200 ml-auto", open && "rotate-90")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px] max-w-[90vw] sm:max-w-md">
        {products.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => {
              onChange(p.id);
              setOpen(false);
            }}
            className="group gap-2 cursor-pointer items-start py-2 focus:bg-primary focus:text-white"
          >
            <Check
              className={cn(
                "w-4 h-4 mt-0.5 flex-shrink-0 transition-colors",
                p.id === selectedId
                  ? "opacity-100 text-primary group-focus:text-white group-hover:text-white"
                  : "opacity-0"
              )}
            />
            <span className="truncate font-medium">{p.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProductSwitcher;
