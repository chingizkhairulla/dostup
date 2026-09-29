import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface BackArrowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  to?: string;
  label?: string;
  iconClassName?: string;
}

export const BackArrowButton = React.forwardRef<
  HTMLButtonElement,
  BackArrowButtonProps
>(({ to, label, className, iconClassName, onClick, ...props }, ref) => {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      aria-label={label || "Назад"}
      className={cn(
        "group inline-flex items-center gap-2 select-none touch-manipulation cursor-pointer",
        // Minimum 44px tap target for mobile touch accessibility
        "min-h-[44px] min-w-[44px] px-2 py-2 -ml-2 rounded-xl transition-all duration-150",
        // Base color
        "text-muted-foreground",
        // Hover styles ONLY on devices that truly support hover (prevents sticky hover on touch)
        "[@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:bg-muted/60",
        // Active state when pressed on touch or click: darkens the icon / background
        "active:bg-muted/90 active:text-foreground active:scale-95 active:brightness-90",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors">
        <ArrowLeft
          className={cn(
            "h-5 w-5 shrink-0 transition-transform group-active:-translate-x-0.5",
            iconClassName
          )}
        />
      </div>
      {label && (
        <span className="text-sm font-medium transition-colors">
          {label}
        </span>
      )}
    </button>
  );
});

BackArrowButton.displayName = "BackArrowButton";
export default BackArrowButton;
