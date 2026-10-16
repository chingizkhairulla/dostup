import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import ProductCard from "@/components/marketplace/ProductCard";
import { RAIL_CHANGE_EVENT } from "@/components/layout/AppNavigationRail";
import { catalogColumnCount, type CatalogProduct } from "@/lib/catalog";

type CatalogGridProps = {
  products: CatalogProduct[];
  empty?: ReactNode;
};

const CatalogGrid = ({ products, empty }: CatalogGridProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener(RAIL_CHANGE_EVENT, measure);
    return () => {
      observer.disconnect();
      window.removeEventListener(RAIL_CHANGE_EVENT, measure);
    };
  }, []);

  const columns = catalogColumnCount(width);

  return (
    <div ref={ref} className="w-full min-w-0">
      {!products.length ? (
        empty ?? null
      ) : (
        <div
          className="grid w-full min-w-0"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(220px, 1fr))`,
            gap: 24,
          }}
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};

export default CatalogGrid;
