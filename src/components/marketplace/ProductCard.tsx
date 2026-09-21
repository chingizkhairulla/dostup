import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ProductCover from "@/components/marketplace/ProductCover";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  formatCatalogPrice,
  formatEventDate,
  isNewProduct,
  productHref,
  type CatalogProduct,
} from "@/lib/catalog";
import { sellerInitial } from "@/lib/productCover";
import { ChevronLeft, ChevronRight, Play, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const ProductCard = ({ product }: { product: CatalogProduct }) => {
  const { t, language } = useLanguage();
  const sellerName = product.seller_display_name || t("author");
  const initial = sellerInitial(sellerName);
  const isNew = isNewProduct(product.created_at);
  const reviewCount = product.review_count ?? 0;

  const mediaList: Array<{ type: "image" | "video"; url: string }> =
    Array.isArray(product.media) && product.media.length > 0
      ? product.media
      : [
          ...(product.image_url ? [{ type: "image" as const, url: product.image_url }] : []),
          ...(product.video_url ? [{ type: "video" as const, url: product.video_url }] : []),
        ];

  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(diff) > 40) {
      e.preventDefault();
      if (diff > 0) {
        setActiveIdx((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1));
      } else {
        setActiveIdx((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0));
      }
    }
  };

  const currentMedia = mediaList[activeIdx];

  const sellerIdentity = (
    <>
      <Avatar className="h-5 w-5">
        {product.seller_avatar_url && <AvatarImage src={product.seller_avatar_url} alt="" />}
        <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
      </Avatar>
      <span className="public-meta truncate">{sellerName}</span>
    </>
  );

  return (
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card motion-safe:transition-shadow motion-safe:hover:shadow-md">
      {isNew && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-[#FF6B00] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
          {t("newProductBadge")}
        </span>
      )}
      {mediaList.length > 0 ? (
        <div
          className="relative aspect-[16/10] w-full overflow-hidden bg-muted"
          onTouchStart={mediaList.length > 1 ? handleTouchStart : undefined}
          onTouchEnd={mediaList.length > 1 ? handleTouchEnd : undefined}
        >
          {currentMedia?.type === "video" ? (
            <div className="relative w-full h-full bg-black flex items-center justify-center isolate">
              <video
                src={currentMedia.url}
                className="w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: (currentMedia as any)?.objectPosition || "center" }}
                preload="auto"
                muted
                playsInline
                webkit-playsinline="true"
              />
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10"
                style={{ transform: "translate3d(0, 0, 10px)" }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6B00] shadow-md transform transition-transform duration-200 ease-out group-hover:scale-110">
                  <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                </span>
              </div>
            </div>
          ) : (
            <img
              src={currentMedia?.url || product.image_url || ""}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          )}

          {/* Стрелки переключения */}
          {mediaList.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveIdx((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1));
                }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-80 z-10"
                title="Предыдущее"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveIdx((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-80 z-10"
                title="Следующее"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Точки-индикаторы */}
              <div
                className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 py-1 px-2 rounded-full bg-black/40 backdrop-blur-xs z-10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {mediaList.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveIdx(i);
                    }}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === activeIdx ? "w-3 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                    )}
                    title={`Медиа ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <ProductCover
          productId={product.id}
          title={product.title}
          imageUrl={product.image_url}
          emoji={product.category_emoji}
          className="rounded-none"
        />
      )}
      <div className="flex min-w-0 flex-col px-4 pb-4 pt-3">
        <h3 className="line-clamp-2 w-full min-w-0 text-base font-semibold leading-snug text-foreground">
          <Link
            to={productHref(product)}
            className="rounded-md focus-ring after:absolute after:inset-0 after:content-['']"
          >
            {product.title}
          </Link>
        </h3>
        {reviewCount > 0 && (
          <div className="mt-1 flex items-center gap-1 text-sm text-[#6B7280]">
            <Star className="h-3.5 w-3.5 fill-[#FFB020] text-[#FFB020]" />
            <span className="font-medium text-foreground">{(product.avg_rating ?? 0).toFixed(1)}</span>
            <span>({reviewCount})</span>
          </div>
        )}
        {product.category_slug === "events" && product.event_starts_at && (
          <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#6B7280]">
            {formatEventDate(product.event_starts_at, language)}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-left text-base font-bold tabular-nums leading-snug text-foreground">
            {formatCatalogPrice(product, language)}
          </p>
          {product.has_free_trial && (
            <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
              Пробный период
            </span>
          )}
        </div>
        {product.seller_handle ? (
          <Link
            to={`/s/${encodeURIComponent(product.seller_handle)}`}
            className="relative z-10 mt-2 flex min-w-0 items-center gap-2 self-start rounded-md focus-ring hover:underline"
          >
            {sellerIdentity}
          </Link>
        ) : (
          <div className="mt-2 flex min-w-0 items-center gap-2">{sellerIdentity}</div>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
