import { useEffect, useState } from "react";
import ProductPage from "@/pages/ProductPage";
import type { Product } from "@/hooks/useProducts";
import { isPreviewMessage, readyMessage } from "@/lib/productPreview";

/**
 * Chrome-less product page rendered inside the seller preview iframe. Draft data
 * arrives over postMessage so unsaved edits can be previewed without a DB write.
 */
const ProductPreviewRoute = () => {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isPreviewMessage(event)) return;
      if (event.data.type === "data") setProduct(event.data.product);
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage(readyMessage(), window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Defence in depth: the preview must not become a way to browse the platform,
  // so any link that slips into the product page is neutralised here too.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      const isExternal = /^(https?:)?\/\//i.test(href) && !href.startsWith(window.location.origin);
      if (isExternal) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return <ProductPage isPreview previewProduct={product} />;
};

export default ProductPreviewRoute;
