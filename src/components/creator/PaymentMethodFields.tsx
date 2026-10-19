import { ArrowLeftRight, CreditCard, Link, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BANK_OPTIONS, cardDigits, filledPaymentMethods, formatCardNumber, lastFilledPaymentMethod, type KaspiMethod, type PaymentMethodFormValue } from "@/lib/paymentMethods";

interface PaymentMethodFieldsProps {
  value: PaymentMethodFormValue & { id: string };
  onChange: (updates: Partial<PaymentMethodFormValue>) => void;
  formatPhone: (raw: string) => string;
  linkPlaceholder: string;
}

const inactiveClassName = "hover:border-primary/30 hover:bg-primary/10 hover:text-foreground";

export default function PaymentMethodFields({ value, onChange, formatPhone, linkPlaceholder }: PaymentMethodFieldsProps) {
  const activeMethod = value.paymentMethod || lastFilledPaymentMethod(value);
  const hasLink = activeMethod === "link";
  const hasTransfer = !hasLink;
  const transferMethod = activeMethod === "card" ? "card" : "phone";

  const changeField = (method: KaspiMethod, text: string) => {
    const key = method === "link" ? "kaspiLink" : method === "phone" ? "kaspiPhone" : "kaspiCard";
    const updated = { ...value, [key]: text };
    onChange({
      [key]: text,
      kaspiMethods: filledPaymentMethods(updated),
      ...(text.trim() ? { lastPaymentMethod: method } : {}),
    });
  };

  return (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground sm:text-base">Способ оплаты <span className="text-primary">*</span></p>
        <p className="text-base leading-relaxed text-muted-foreground">Можно вписать несколько</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Способ оплаты">
        <Button type="button" variant={hasLink ? "default" : "toggle"} aria-pressed={hasLink}
          className={hasLink ? "text-white" : inactiveClassName} onClick={() => onChange({ paymentMethod: "link" })}>
          <Link aria-hidden="true" /> Ссылка
        </Button>
        <Button type="button" variant={hasTransfer ? "default" : "toggle"} aria-pressed={hasTransfer}
          className={hasTransfer ? "text-white" : inactiveClassName}
          onClick={() => onChange({ paymentMethod: value.transferMethod || (value.lastPaymentMethod === "card" ? "card" : "phone") })}>
          <ArrowLeftRight aria-hidden="true" /> Перевод
        </Button>
      </div>
      {hasLink && (
        <div className="space-y-1.5">
          <Input id={`kaspi-link-${value.id}`} type="url" aria-label="Ссылка на оплату" placeholder={linkPlaceholder} className="h-11 text-base"
            value={value.kaspiLink} onChange={(event) => changeField("link", event.target.value)} />
        </div>
      )}
      {hasTransfer && (
        <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Реквизиты перевода">
            {(["phone", "card"] as const).map((method) => {
              const active = transferMethod === method;
              const Icon = method === "phone" ? Smartphone : CreditCard;
              return (
                <Button key={method} type="button" variant={active ? "default" : "toggle"} aria-pressed={active}
                  className={active ? "text-white" : inactiveClassName} onClick={() => onChange({ paymentMethod: method, transferMethod: method })}>
                  <Icon aria-hidden="true" /> {method === "phone" ? "Телефон" : "Карта"}
                </Button>
              );
            })}
          </div>
          {transferMethod === "phone" && (
            <div>
              <Label htmlFor={`kaspi-phone-${value.id}`} className="sr-only">Телефон</Label>
              <Input id={`kaspi-phone-${value.id}`} type="tel" placeholder="+7 776 475 00-99" className="h-11 text-base"
                value={value.kaspiPhone} onChange={(event) => changeField("phone", formatPhone(event.target.value))} />
            </div>
          )}
          {transferMethod === "card" && (
            <div>
              <Label htmlFor={`kaspi-card-${value.id}`} className="sr-only">Карта</Label>
              <Input id={`kaspi-card-${value.id}`} type="text" inputMode="numeric" autoComplete="off"
                placeholder="0000 0000 0000 0000" maxLength={19} className="h-11 text-base tracking-wider"
                value={formatCardNumber(value.kaspiCard)} onChange={(event) => changeField("card", cardDigits(event.target.value))} />
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
                    {bank.logo && <img src={bank.logo} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />}
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
