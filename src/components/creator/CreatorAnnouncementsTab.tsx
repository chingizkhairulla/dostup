import { useEffect, useState } from "react";
import { useCreatorProducts } from "@/hooks/useProducts";
import { Loader2, Megaphone } from "lucide-react";
import ProductAnnouncementsManager from "./ProductAnnouncementsManager";
import ProductSwitcher from "./ProductSwitcher";
import NoProductsEmptyState from "./NoProductsEmptyState";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props { creatorName: string; onGoToProducts?: () => void; }

const CreatorAnnouncementsTab = ({ creatorName, onGoToProducts }: Props) => {
  const { data: products = [], isLoading } = useCreatorProducts();
  const { language, l } = useLanguage();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && products.length > 0) {
      setSelectedId(products[0].id);
    }
  }, [products, selectedId]);

  const product = products.find((p) => p.id === selectedId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{l({ ru: "Объявления", kk: "Хабарландырулар", en: "Announcements" })}</h2>
        </div>
        <NoProductsEmptyState section="announcements" onGoToProducts={onGoToProducts} />
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        {l({ ru: "Объявления", kk: "Хабарландырулар", en: "Announcements" })}
      </h2>
      <ProductSwitcher
        products={products.map((p) => ({ id: p.id, title: p.title }))}
        selectedId={selectedId}
        onChange={setSelectedId}
      />
      <ProductAnnouncementsManager
        key={product.id}
        productId={product.id}
        productTitle={product.title}
        initialGroupLinkUrl={(product as any).telegram_link || null}
        initialGroupLinkLabel={(product as any).group_link_label || null}
        hideBackButton
      />
    </div>
  );
};

export default CreatorAnnouncementsTab;