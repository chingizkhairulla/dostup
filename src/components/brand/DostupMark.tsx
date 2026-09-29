import { cn } from "@/lib/utils";

/**
 * The Dostup logo mark (the orange square "D") used as the support chat's avatar. It is the
 * real logo file rather than the full wordmark, whose lettering would be a smudge at this size.
 */
const DostupMark = ({ className }: { className?: string }) => (
  <img
    src="/icon-source.png"
    alt=""
    aria-hidden
    draggable={false}
    className={cn("h-10 w-10 shrink-0 rounded-[28%] object-cover", className)}
  />
);

export default DostupMark;
