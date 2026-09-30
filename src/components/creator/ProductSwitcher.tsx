import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Package, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductOption { id: string; title: string; }

interface Props {
  products: ProductOption[];
  selectedId: string | null;
  onChange: (id: string) => void;
  className?: string;
}

const ProductSwitcher = ({ products, selectedId, onChange, className }: Props) => {
  const selected = products.find((p) => p.id === selectedId) || products[0];
  if (!selected) return null;

  if (products.length === 1) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted text-sm font-medium max-w-full",
          className,
        )}
      >
        <Package className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="truncate">{selected.title}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("group gap-2 max-w-full", className)}>
          {/* text-inherit on hover: the trigger turns orange, so an orange icon would vanish. */}
          <Package className="w-4 h-4 flex-shrink-0 text-primary transition-colors group-hover:text-inherit" />
          <span className="truncate">{selected.title}</span>
          <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[80vw]">
        {products.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => onChange(p.id)}
            className="gap-2"
          >
            <Check className={`w-4 h-4 ${p.id === selected.id ? "opacity-100" : "opacity-0"}`} />
            <span className="truncate">{p.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProductSwitcher;
