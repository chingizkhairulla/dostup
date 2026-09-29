import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { PaymentMethod } from "@/types";
import {
  formatCardDisplay,
  formatPhoneInput,
  getBankDisplayName,
  EMOJI_FONT_STACK,
} from "@/lib/paymentMethods";
import { cn } from "@/lib/utils";

interface ProductPaymentMethodsListProps {
  methods: PaymentMethod[];
  disabled?: boolean;
  className?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  selectable?: boolean;
}

export const ProductPaymentMethodsList: React.FC<ProductPaymentMethodsListProps> = ({
  methods,
  disabled = false,
  className,
  selectedId,
  onSelect,
  selectable = false,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (method: PaymentMethod) => {
    try {
      await navigator.clipboard.writeText(method.value);
      setCopiedId(method.id);
      toast.success("Скопировано");
      setTimeout(() => {
        setCopiedId((current) => (current === method.id ? null : current));
      }, 2500);
    } catch {
      toast.error(method.value);
    }
  };

  const handleOpenLink = (url: string) => {
    if (!url) return;
    const finalUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  };

  if (!methods || methods.length === 0) {
    return (
      <div className="border border-input rounded-xl p-4 bg-muted/50 text-center">
        <p className="text-sm text-muted-foreground">
          Способ оплаты не указан
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {methods.filter(Boolean).map((method) => {
        const isCopied = copiedId === method.id;
        const isSelected = selectedId === method.id;
        const bankName = getBankDisplayName(method.bank, method.bank_name);
        const val = method.value || "";
        const isKaspiLink =
          method.type === "link" &&
          (val.toLowerCase().includes("kaspi.kz") || method.bank === "kaspi");

        if (method.type === "link") {
          const buttonLabel = isKaspiLink ? "Открыть в Kaspi" : "Открыть ссылку";
          const isKaspiColor = isKaspiLink;

          return (
            <div
              key={method.id}
              role={selectable ? "radio" : undefined}
              aria-checked={selectable ? isSelected : undefined}
              tabIndex={selectable ? 0 : undefined}
              onClick={() => selectable && onSelect?.(method.id)}
              onKeyDown={(e) => {
                if (selectable && (e.key === " " || e.key === "Enter")) {
                  e.preventDefault();
                  onSelect?.(method.id);
                }
              }}
              className={cn(
                "rounded-2xl border transition-all p-3 space-y-2",
                selectable ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" : "",
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                  : "border-border bg-card hover:border-border/80"
              )}
            >
              {selectable && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Ссылка для оплаты
                  </span>
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              )}
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenLink(method.value);
                }}
                disabled={disabled}
                className={cn(
                  "w-full h-12 font-semibold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2",
                  isKaspiColor
                    ? "bg-[#F14635] hover:bg-[#d63d2e] text-white"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                )}
              >
                <span>{buttonLabel}</span>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          );
        }

        const isCard = method.type === "card";
        const formattedDisplay = isCard
          ? formatCardDisplay(method.value)
          : formatPhoneInput(method.value);

        return (
          <div
            key={method.id}
            role={selectable ? "radio" : undefined}
            aria-checked={selectable ? isSelected : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={() => selectable && onSelect?.(method.id)}
            onKeyDown={(e) => {
              if (selectable && (e.key === " " || e.key === "Enter")) {
                e.preventDefault();
                onSelect?.(method.id);
              }
            }}
            className={cn(
              "rounded-2xl border bg-card p-4 space-y-3 transition-all",
              selectable ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" : "",
              isSelected
                ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                : "border-border hover:border-border/80 shadow-2xs"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-semibold text-foreground flex items-center gap-1"
                  style={{ fontFamily: EMOJI_FONT_STACK }}
                >
                  {isCard ? "💳 Карта" : "📱 Телефон"}
                </span>

                {bankName && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                    {bankName}
                  </span>
                )}
              </div>

              {selectable && (
                <div
                  className={cn(
                    "w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                  )}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              )}
            </div>

            <div className="bg-muted/40 rounded-xl p-3 border border-border/60">
              <p className="text-xs text-muted-foreground mb-1">
                {isCard ? "Номер карты для перевода:" : "Номер телефона для перевода:"}
              </p>
              <p className="font-mono text-lg font-bold text-foreground tracking-wider select-all break-all">
                {formattedDisplay}
              </p>
              {method.recipient_name && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Имя получателя:{" "}
                  <span className="font-semibold text-foreground">{method.recipient_name}</span>
                </p>
              )}
            </div>

            <Button
              type="button"
              variant={isCopied ? "default" : "outline"}
              className={cn(
                "w-full h-11 rounded-xl font-medium transition-all gap-2",
                isCopied && "bg-success text-success-foreground hover:bg-success/90 border-success"
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(method);
              }}
              disabled={disabled}
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Скопировать</span>
                </>
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default ProductPaymentMethodsList;
