import { useEffect } from "react";

/**
 * Hides vertical scrollbars while keeping mouse, wheel, touch, and keyboard scrolling functional.
 * Scoped to the mounting component (adds class on mount, removes on unmount).
 */
export function useHideScrollbar() {
  useEffect(() => {
    document.documentElement.classList.add("no-scrollbar");
    document.body.classList.add("no-scrollbar");
    return () => {
      document.documentElement.classList.remove("no-scrollbar");
      document.body.classList.remove("no-scrollbar");
    };
  }, []);
}
