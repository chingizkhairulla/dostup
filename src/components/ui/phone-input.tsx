import * as React from "react";
import { cn } from "@/lib/utils";
import {
  extractPhone10Digits,
  format10Digits,
  isValidKazakhPhone,
} from "@/lib/paymentMethods";

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: string | null;
  onChange?: (formattedValue: string, raw10: string) => void;
  hasError?: boolean;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      className,
      value,
      onChange,
      hasError,
      disabled,
      placeholder = "701 123 45 67",
      ...props
    },
    ref
  ) => {
    const raw10 = extractPhone10Digits(value);
    const displayValue = format10Digits(raw10);

    const applyDigits = (digits: string) => {
      const clean10 = digits.replace(/\D/g, "").slice(0, 10);
      const fullValue = clean10 ? `+7 ${format10Digits(clean10)}` : "";
      onChange?.(fullValue, clean10);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === "Backspace" ||
        e.key === "Delete" ||
        e.key === "Tab" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Home" ||
        e.key === "End" ||
        e.ctrlKey ||
        e.metaKey
      ) {
        if (e.key === "Backspace") {
          const target = e.currentTarget;
          const start = target.selectionStart ?? 0;
          const end = target.selectionEnd ?? 0;
          if (start === end && start > 0) {
            e.preventDefault();
            const currentDigits = raw10;
            if (start >= target.value.length) {
              applyDigits(currentDigits.slice(0, -1));
            } else {
              const textBefore = target.value.slice(0, start);
              const digitsBefore = textBefore.replace(/\D/g, "");
              const idxToRemove = digitsBefore.length - 1;
              if (idxToRemove >= 0) {
                const newDigits =
                  currentDigits.slice(0, idxToRemove) +
                  currentDigits.slice(idxToRemove + 1);
                applyDigits(newDigits);
              }
            }
          }
        }
        return;
      }

      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        if (raw10.length < 10) {
          applyDigits(raw10 + e.key);
        }
        return;
      }

      e.preventDefault();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text");
      const digits = pasted.replace(/\D/g, "");

      let remainder = digits;
      // Strip leading 7 or 8 ONLY if total digits length is 11 (e.g. 8701... or +7 701...)
      if (
        digits.length === 11 &&
        (digits.startsWith("7") || digits.startsWith("8"))
      ) {
        remainder = digits.slice(1);
      }
      applyDigits(remainder.slice(0, 10));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputVal = e.target.value;
      const digits = inputVal.replace(/\D/g, "");
      applyDigits(digits.slice(0, 10));
    };

    return (
      <div
        className={cn(
          "flex items-center h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm sm:text-base ring-offset-background transition-all focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          hasError && "border-destructive focus-within:ring-destructive",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <span className="shrink-0 font-medium text-foreground select-none pr-1.5 tracking-wider">
          +7
        </span>
        <input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onChange={handleChange}
          className="flex-1 bg-transparent border-0 outline-none p-0 text-foreground placeholder:text-muted-foreground/60 tracking-wider font-mono sm:font-sans focus:outline-none focus:ring-0"
          {...props}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { isValidKazakhPhone };
export default PhoneInput;
