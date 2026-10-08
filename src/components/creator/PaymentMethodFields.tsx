import { ArrowLeftRight, CreditCard, Link, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BANK_OPTIONS, cardDigits, formatCardNumber, type KaspiMethod, type PaymentMethodFormValue } from "@/lib/paymentMethods";

interface PaymentMethodFieldsProps {
  value: PaymentMethodFormValue & { id: string };
  onChange: (updates: Partial<PaymentMethodFormValue>) => void;
  formatPhone: (raw: string) => string;
  linkPlaceholder: string;
}

const inactiveClassName = "hover:border-primary/30 hover:bg-primary/10 hover:text-foreground";

export default function PaymentMethodFields({ value, onChange, formatPhone, linkPlaceholder }: PaymentMethodFieldsProps) {
  const hasLink = value.kaspiMethods.includes("link");
  const hasTransfer = value.kaspiMethods.some((method) => method === "phone" || method === "card");

  const toggleMethod = (method: KaspiMethod) => {
    const active = value.kaspiMethods.includes(method);
    onChange({ kaspiMethods: active ? value.kaspiMethods.filter((item) => item !== method) : [...value.kaspiMethods, method] });
  };

  return (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground sm:text-base">Способ оплаты <span className="text-primary">*</span></p>
        <p className="text-xs text-muted-foreground">Можно выбрать несколько — покупатель увидит все.</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Способ оплаты">
        <Button type="button" variant={hasLink ? "default" : "toggle"} aria-pressed={hasLink}
          className={hasLink ? "text-white" : inactiveClassName} onClick={() => toggleMethod("link")}>
          <Link aria-hidden="true" /> Ссылка
        </Button>
        <Button type="button" variant={hasTransfer ? "default" : "toggle"} aria-pressed={hasTransfer}
          className={hasTransfer ? "text-white" : inactiveClassName}
          onClick={() => onChange({ kaspiMethods: hasTransfer ? value.kaspiMethods.filter((method) => method === "link") : [...value.kaspiMethods, "phone"] })}>
          <ArrowLeftRight aria-hidden="true" /> Перевод
        </Button>
      </div>
      {hasLink && (
        <div className="space-y-1.5">
          <Label htmlFor={`kaspi-link-${value.id}`} className="text-xs text-muted-foreground">Ссылка на оплату</Label>
          <Input id={`kaspi-link-${value.id}`} type="url" placeholder={linkPlaceholder} className="h-11 text-base"
            value={value.kaspiLink} onChange={(event) => onChange({ kaspiLink: event.target.value })} />
        </div>
      )}
      {hasTransfer && (
        <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Реквизиты перевода">
            {(["phone", "card"] as const).map((method) => {
              const active = value.kaspiMethods.includes(method);
              const Icon = method === "phone" ? Smartphone : CreditCard;
              return (
                <Button key={method} type="button" variant={active ? "default" : "toggle"} aria-pressed={active}
                  className={active ? "text-white" : inactiveClassName} onClick={() => toggleMethod(method)}>
                  <Icon aria-hidden="true" /> {method === "phone" ? "Телефон" : "Карта"}
                </Button>
              );
            })}
          </div>
          {value.kaspiMethods.includes("phone") && (
            <div>
              <Label htmlFor={`kaspi-phone-${value.id}`} className="sr-only">Телефон</Label>
              <Input id={`kaspi-phone-${value.id}`} type="tel" placeholder="+7 776 475 00-99" className="h-11 text-base"
                value={value.kaspiPhone} onChange={(event) => onChange({ kaspiPhone: formatPhone(event.target.value) })} />
            </div>
          )}
          {value.kaspiMethods.includes("card") && (
            <div>
              <Label htmlFor={`kaspi-card-${value.id}`} className="sr-only">Карта</Label>
              <Input id={`kaspi-card-${value.id}`} type="text" inputMode="numeric" autoComplete="off"
                placeholder="0000 0000 0000 0000" maxLength={19} className="h-11 text-base tracking-wider"
                value={formatCardNumber(value.kaspiCard)} onChange={(event) => onChange({ kaspiCard: cardDigits(event.target.value) })} />
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Банк для перевода</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Банк для перевода">
              {BANK_OPTIONS.map((bank) => {
                const active = value.bank === bank.value;
                return (
                  <Button key={bank.value} type="button" size="sm" variant={active ? "default" : "toggle"}
                    aria-pressed={active} className={`gap-1.5 px-2 text-xs sm:text-sm ${active ? "text-white" : inactiveClassName}`}
                    onClick={() => onChange({ bank: bank.value })}>
                    {bank.logo && <img src={bank.logo} alt="" className={`h-4 w-4 shrink-0 rounded-sm object-contain ${active ? "brightness-0 invert" : ""}`} />}
                    {bank.label}
                  </Button>
                );
              })}
            </div>
            {value.bank === "other" && (
              <div>
                <Label htmlFor={`bank-name-${value.id}`} className="sr-only">Название банка</Label>
                <Input id={`bank-name-${value.id}`} type="text" placeholder="Название банка" className="h-11 text-base"
                  value={value.bankName} onChange={(event) => onChange({ bankName: event.target.value })} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
