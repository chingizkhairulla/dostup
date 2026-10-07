import { useEffect, useRef, type RefObject } from "react";

const FOLLOW_MS = 3000;

/**
 * Keeps a chat-like view scrolled to the newest message: jumps to the bottom when a
 * channel opens and glides there when a message is added (not when one is removed).
 *
 * Scrolls the window by default, or `container` when the feed lives in its own
 * scrollable pane (the messenger layout).
 */
export function useStickToBottom(
  ready: boolean,
  channelKey: string | null,
  count: number,
  container?: RefObject<HTMLElement | null>,
) {
  const seen = useRef<{ key: string | null; count: number }>({ key: null, count: 0 });

  useEffect(() => {
    if (!ready || !channelKey) return;
    const pane = container?.current ?? null;
    if (container && !pane) return;

    const opened = seen.current.key !== channelKey;
    const grew = count > seen.current.count;
    seen.current = { key: channelKey, count };
    if (!opened && !grew) return;

    const toBottom = (behavior: ScrollBehavior) => {
      if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior });
      else window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
    };
    const frame = requestAnimationFrame(() => toBottom(opened ? "auto" : "smooth"));

    // Photos finish loading after the jump and push the newest post down: follow them
    // for a moment, unless the reader starts scrolling on their own.
    let following = opened;
    const stop = () => {
      following = false;
    };
    const observer = new ResizeObserver(() => {
      if (following) toBottom("auto");
    });
    observer.observe(pane?.firstElementChild ?? pane ?? document.body);
    const target: HTMLElement | Window = pane ?? window;
    target.addEventListener("wheel", stop, { passive: true });
    target.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    const timer = window.setTimeout(stop, FOLLOW_MS);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      target.removeEventListener("wheel", stop);
      target.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
      window.clearTimeout(timer);
    };
  }, [ready, channelKey, count, container]);
}
