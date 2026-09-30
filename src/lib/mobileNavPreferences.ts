import { useEffect, useMemo, useState } from "react";
import {
  BUYER_MOBILE_NAV_ITEMS,
  SELLER_NAV_ITEMS,
  type BuyerSectionKey,
  type SellerSectionKey,
} from "./navigation";
import { mergeNavOrder } from "./navOrder";

export const MOBILE_NAV_EVENT = "mobile-nav-order-changed";
export const MAX_MOBILE_NAV_ITEMS = 4;

const BUYER_NAV_STORAGE_KEY = "buyer_mobile_nav_order_v2";
const CREATOR_NAV_STORAGE_KEY = "creator_mobile_nav_order_v2";

export function getBuyerNavOrder(): BuyerSectionKey[] {
  const allKeys = BUYER_MOBILE_NAV_ITEMS.map((i) => i.key);
  try {
    const raw = localStorage.getItem(BUYER_NAV_STORAGE_KEY);
    if (raw) return mergeNavOrder(JSON.parse(raw), allKeys);
  } catch {}
  return allKeys;
}

export function saveBuyerNavOrder(order: BuyerSectionKey[]) {
  try {
    localStorage.setItem(BUYER_NAV_STORAGE_KEY, JSON.stringify(order));
    window.dispatchEvent(new Event(MOBILE_NAV_EVENT));
  } catch {}
}

export function getCreatorNavOrder(): SellerSectionKey[] {
  const allKeys: SellerSectionKey[] = ["products", "announcements", "materials", "schedule", "users"];
  try {
    const raw = localStorage.getItem(CREATOR_NAV_STORAGE_KEY);
    if (raw) return mergeNavOrder(JSON.parse(raw), allKeys);
  } catch {}
  return allKeys;
}

export function saveCreatorNavOrder(order: SellerSectionKey[]) {
  try {
    localStorage.setItem(CREATOR_NAV_STORAGE_KEY, JSON.stringify(order));
    window.dispatchEvent(new Event(MOBILE_NAV_EVENT));
  } catch {}
}

export function useBuyerMobileNavItems() {
  const [order, setOrder] = useState<BuyerSectionKey[]>(getBuyerNavOrder);

  useEffect(() => {
    const handle = () => setOrder(getBuyerNavOrder());
    window.addEventListener(MOBILE_NAV_EVENT, handle);
    return () => window.removeEventListener(MOBILE_NAV_EVENT, handle);
  }, []);

  return useMemo(() => {
    const items = order.map((key) => BUYER_MOBILE_NAV_ITEMS.find((i) => i.key === key)!).filter(Boolean);
    return {
      order,
      allItems: items,
      activeItems: items.slice(0, MAX_MOBILE_NAV_ITEMS),
      hiddenItems: items.slice(MAX_MOBILE_NAV_ITEMS),
      setOrder: saveBuyerNavOrder,
    };
  }, [order]);
}

export function useCreatorMobileNavItems() {
  const [order, setOrder] = useState<SellerSectionKey[]>(getCreatorNavOrder);

  useEffect(() => {
    const handle = () => setOrder(getCreatorNavOrder());
    window.addEventListener(MOBILE_NAV_EVENT, handle);
    return () => window.removeEventListener(MOBILE_NAV_EVENT, handle);
  }, []);

  return useMemo(() => {
    const items = order.map((key) => SELLER_NAV_ITEMS.find((i) => i.key === key)!).filter(Boolean);
    return {
      order,
      allItems: items,
      activeItems: items.slice(0, MAX_MOBILE_NAV_ITEMS),
      hiddenItems: items.slice(MAX_MOBILE_NAV_ITEMS),
      setOrder: saveCreatorNavOrder,
    };
  }, [order]);
}
