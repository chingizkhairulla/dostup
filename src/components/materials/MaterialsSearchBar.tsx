import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  value: string;
  onChange: (v: string) => void;
  resultCount?: number;
  className?: string;
}

const MaterialsSearchBar = ({ value, onChange, resultCount, className }: Props) => {
  const { language, l } = useLanguage();
  const placeholder = l({ ru: "Поиск по названию…", kk: "Атау бойынша іздеу…", en: "Search by title…" });
  const found = l({ ru: "Найдено", kk: "Табылды", en: "Found" });
  return (
    <div className={className}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-9"
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange("")}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {value.trim() && typeof resultCount === "number" && (
        <p className="text-xs text-muted-foreground mt-1.5">
          {found}: {resultCount}
        </p>
      )}
    </div>
  );
};

export default MaterialsSearchBar;