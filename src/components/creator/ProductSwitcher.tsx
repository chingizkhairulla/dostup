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
}

const ProductSwitcher = ({ products, selectedId, onChange, className, placeholder, disabled, hideIcon }: Props) => {
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
        className={cn("gap-2 max-w-full font-medium cursor-default hover:bg-transparent hover:text-foreground", className)}
        title={displayTitle}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!hideIcon && <Package className="w-4 h-4 text-primary flex-shrink-0" />}
          <span className="truncate text-left">{displayTitle}</span>
        </div>
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("gap-2 max-w-full font-medium", className)}
          title={displayTitle}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!hideIcon && <Package className="w-4 h-4 text-primary flex-shrink-0" />}
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
            className="gap-2 cursor-pointer items-start py-2"
          >
            <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${p.id === selectedId ? "opacity-100 text-primary" : "opacity-0"}`} />
            <span className="whitespace-normal break-words text-sm">{p.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProductSwitcher;