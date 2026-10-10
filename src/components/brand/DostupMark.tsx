import { cn } from "@/lib/utils";

/**
 * The full "Dostup" wordmark in a round avatar, the same circle every other chat has —
 * used as the support chat's picture.
 */
const DostupMark = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn(
      "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-white",
      className,
    )}
  >
    <img src="/logo-wordmark.png" alt="" draggable={false} className="w-[84%] object-contain" />
  </span>
);

export default DostupMark;
