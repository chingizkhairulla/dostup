import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CatalogSectionHeaderProps = {
  title: ReactNode;
  /** Right-aligned control on the same line (e.g. "see all" or "back"). */
  action?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
  titleClassName?: string;
};

/**
 * Title row shared by the homepage rails and their full pages, so the title
 * keeps the same left edge and size when navigating between them.
 * The font shrinks on narrow phones so the title stays on one line next to the action.
 */
const CatalogSectionHeader = ({
  title,
  action,
  as: Heading = "h2",
  className,
  titleClassName,
}: CatalogSectionHeaderProps) => (
  <div className={cn("mb-6 flex items-center justify-between gap-4", className)}>
    <Heading
      className={cn(
        "min-w-0 font-bold tracking-tight text-[#1F2328]",
        titleClassName || "text-[clamp(20px,6vw,26px)]"
      )}
    >
      {title}
    </Heading>
    {action}
  </div>
);

export default CatalogSectionHeader;
