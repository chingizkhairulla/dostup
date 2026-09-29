import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "creator_selected_product";
const EVENT = "creator-selected-product";

const read = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * The product a seller last picked in any section (materials, buyers…), so switching sections
 * keeps the same product selected. Falls back to the first product when the saved one is gone.
 */
export function useSelectedCreatorProduct(products: { id: string }[]) {
  const [stored, setStored] = useState<string | null>(read);

  useEffect(() => {
    const sync = () => setStored(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((id: string) => {
    setStored(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage unavailable: the choice lasts for this screen only.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const selectedId = products.some((p) => p.id === stored) ? stored : products[0]?.id ?? null;
  return [selectedId, select] as const;
}
