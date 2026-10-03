import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AuthMark } from "@/components/auth/AuthMark";
import InstallBanner from "@/components/install/InstallBanner";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  children?: ReactNode;
  className?: string;
  /** A bar under the header that stays with it while scrolling (e.g. a back button). */
  below?: ReactNode;
};

/** Gap between the sticky header and anything that sticks beneath it. */
const STICKY_GAP_PX = 24;

/** Full-width header beside the rail; logo is always 24px from the left edge. */
const AppHeader = ({ children, className, below }: AppHeaderProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  // Publishes the header's real height (the install banner and the `below`
  // bar change it) so sticky content further down can sit right under it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--public-sticky-offset", `${el.offsetHeight + STICKY_GAP_PX}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--public-sticky-offset");
    };
  }, []);

  return (
    <div ref={ref} className={cn("sticky top-0 z-30 safe-area-inset", className)}>
      <InstallBanner />
      <header className="border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-6 pl-6 pr-6">
          <Link to="/" className="flex shrink-0 items-center focus-ring rounded-md" aria-label="Dostup">
            <AuthMark variant="brand" className="h-[28px] w-auto" />
          </Link>
          {children ? <div className="flex shrink-0 items-center gap-2 md:gap-1">{children}</div> : null}
        </div>
      </header>
      {below ? (
        <div data-testid="header-below" className="bg-background">
          <div className="public-container py-3">{below}</div>
        </div>
      ) : null}
    </div>
  );
};

export default AppHeader;
