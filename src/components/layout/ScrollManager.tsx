import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Module-level map to store scroll positions across route transitions per location.key
const scrollPositions = new Map<string, number>();

/**
 * Checks if the current pathname/query represents a full-list view.
 */
function isFullListView(pathname: string, search: string): boolean {
  if (pathname === "/new" || pathname === "/top-rated") return true;
  if (!search) return false;
  const params = new URLSearchParams(search);
  const sort = params.get("sort");
  const view = params.get("view");
  const list = params.get("list");
  return (
    sort === "newest" ||
    sort === "rating" ||
    view === "all" ||
    view === "full" ||
    Boolean(list)
  );
}

function getScrollableElements(): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const candidates = document.querySelectorAll<HTMLElement>(
    ".no-scrollbar, [data-scroll-container], main"
  );
  candidates.forEach((el) => {
    const style = window.getComputedStyle(el);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    ) {
      elements.push(el);
    }
  });
  return elements;
}

function getCurrentScroll(): number {
  const winY =
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0;
  if (winY > 0) return winY;

  const elements = getScrollableElements();
  for (const el of elements) {
    if (el.scrollTop > 0) return el.scrollTop;
  }

  const noScrollbars = document.querySelectorAll<HTMLElement>(".no-scrollbar");
  for (const el of noScrollbars) {
    if (el.scrollTop > 0) return el.scrollTop;
  }

  return winY;
}

function applyScroll(top: number) {
  window.scrollTo({ top, left: 0, behavior: "instant" });
  if (document.documentElement) document.documentElement.scrollTop = top;
  if (document.body) document.body.scrollTop = top;

  const elements = getScrollableElements();
  elements.forEach((el) => {
    el.scrollTop = top;
  });

  const noScrollbars = document.querySelectorAll<HTMLElement>(".no-scrollbar");
  noScrollbars.forEach((el) => {
    el.scrollTop = top;
  });
}

let cancelPendingRestore: (() => void) | null = null;

function performScroll(targetTop: number) {
  if (cancelPendingRestore) {
    cancelPendingRestore();
    cancelPendingRestore = null;
  }

  // 1. Immediate scroll
  applyScroll(targetTop);

  if (targetTop === 0) {
    requestAnimationFrame(() => applyScroll(0));
    return;
  }

  // 2. For POP restore (> 0), content might be hydrating or loading (e.g. React Query)
  let attempts = 0;
  const maxAttempts = 20; // 20 * 25ms = 500ms
  let userInteracted = false;

  const onUserInteraction = () => {
    userInteracted = true;
    cleanup();
  };

  window.addEventListener("wheel", onUserInteraction, { passive: true, once: true });
  window.addEventListener("touchstart", onUserInteraction, { passive: true, once: true });
  window.addEventListener("keydown", onUserInteraction, { passive: true, once: true });

  const intervalId = setInterval(() => {
    if (userInteracted) return;
    attempts++;
    applyScroll(targetTop);
    const current = getCurrentScroll();
    if (Math.abs(current - targetTop) <= 2 || attempts >= maxAttempts) {
      cleanup();
    }
  }, 25);

  function cleanup() {
    clearInterval(intervalId);
    window.removeEventListener("wheel", onUserInteraction);
    window.removeEventListener("touchstart", onUserInteraction);
    window.removeEventListener("keydown", onUserInteraction);
    cancelPendingRestore = null;
  }

  cancelPendingRestore = cleanup;
}

/**
 * App-wide scroll manager mounted inside BrowserRouter.
 * - On PUSH or REPLACE: resets scroll to top.
 * - On POP: restores saved position for location.key.
 * - Triggers on pathname changes or entering full-list views, NOT on filter/category changes.
 */
export default function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  const currentKeyRef = useRef(location.key);
  const prevLocationRef = useRef(location);

  // Disable native scroll restoration so this manager has full control
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      const prev = window.history.scrollRestoration;
      window.history.scrollRestoration = "manual";
      return () => {
        window.history.scrollRestoration = prev;
      };
    }
  }, []);

  // Save scroll position as user scrolls
  useEffect(() => {
    currentKeyRef.current = location.key;

    const handleScroll = () => {
      const pos = getCurrentScroll();
      scrollPositions.set(currentKeyRef.current, pos);
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [location.key]);

  // Handle route navigation
  useLayoutEffect(() => {
    const prev = prevLocationRef.current;
    prevLocationRef.current = location;

    const pathnameChanged = prev.pathname !== location.pathname;
    const wasFullList = isFullListView(prev.pathname, prev.search);
    const isFullList = isFullListView(location.pathname, location.search);

    const enteredFullListViaQuery = !wasFullList && isFullList;
    const changedFullListQuery = wasFullList && isFullList && prev.search !== location.search;

    const shouldTrigger = pathnameChanged || enteredFullListViaQuery || changedFullListQuery;

    if (!shouldTrigger) {
      // Filter changes (category chips, search query, format) on same pathname do not jump
      return;
    }

    // Save previous page position before navigating away
    const lastPos = getCurrentScroll();
    scrollPositions.set(prev.key, lastPos);

    if (navigationType === "POP") {
      const saved = scrollPositions.get(location.key) ?? 0;
      performScroll(saved);
    } else {
      performScroll(0);
      scrollPositions.set(location.key, 0);
    }
  }, [location, navigationType]);

  return null;
}
