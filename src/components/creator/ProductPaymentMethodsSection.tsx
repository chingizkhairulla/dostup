import React, { useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import {
  useCreatorPaymentMethods,
  useCreatePaymentMethod,
  type PaymentMethod,
} from "@/hooks/useProducts";
import {
  validateLuhn,
  formatCardInput,
  maskCardNumber,
  formatPhoneInput,
  cleanPhone,
  extractPhone10Digits,
  getBankDisplayName,
  EMOJI_FONT_STACK,
} from "@/lib/paymentMethods";
import { PhoneInput } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";

export interface ProductPaymentMethodsSectionRef {
  isEditorOpen: () => boolean;
  saveIfOpen: () => Promise<{ saved: boolean; methodId?: string; hasErrors: boolean }>;
}

export interface ProductPaymentMethodsSectionProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  isPaid: boolean;
  errorMessage?: string;
  hasSubmitAttempt?: boolean;
}

type MethodType = "link" | "phone" | "card";
type BankType = "kaspi" | "halyk" | "freedom" | "other";

interface EditorFieldErrors {
  value?: string;
  recipientName?: string;
  bankName?: string;
}

export const ProductPaymentMethodsSection = forwardRef<
  ProductPaymentMethodsSectionRef,
  ProductPaymentMethodsSectionProps
>(({ selectedIds, onChange, isPaid, errorMessage, hasSubmitAttempt }, ref) => {
  const { data: rawSavedMethods = [], isLoading } = useCreatorPaymentMethods();
  const savedMethods = Array.isArray(rawSavedMethods) ? rawSavedMethods.filter(Boolean) : [];
  const createMethod = useCreatePaymentMethod();

  const [isAdding, setIsAdding] = useState(false);
  const [methodType, setMethodType] = useState<MethodType>("phone");
  const [bank, setBank] = useState<BankType>("kaspi");
  const [bankName, setBankName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [value, setValue] = useState("");
  const [fieldErrors, setFieldErrors] = useState<EditorFieldErrors>({});

  const resetForm = () => {
    setIsAdding(false);
    setMethodType("phone");
    setBank("kaspi");
    setBankName("");
    setRecipientName("");
    setValue("");
    setFieldErrors({});
  };

  const handleToggle = (id: string) => {
    const current = Array.isArray(selectedIds) ? selectedIds : [];
    if (current.includes(id)) {
      onChange(current.filter((item) => item !== id));
    } else {
      onChange([...current, id]);
    }
  };

  const validateEditorFields = (): { isValid: boolean; errors: EditorFieldErrors } => {
    const errs: EditorFieldErrors = {};
    const cleanVal = (value || "").trim();

    if (methodType === "card") {
      const digitsOnly = cleanVal.replace(/\D/g, "");
      if (digitsOnly.length !== 16) {
        errs.value = "Номер карты должен содержать 16 цифр";
      } else if (!validateLuhn(digitsOnly)) {
        errs.value = "Проверьте номер карты";
      }
    } else if (methodType === "phone") {
      const tenDigits = extractPhone10Digits(cleanVal);
      if (tenDigits.length !== 10) {
        errs.value = "Введите корректный номер телефона (10 цифр)";
      }
    } else if (methodType === "link") {
      if (!cleanVal) {
        errs.value = "Введите ссылку на оплату";
      }
    }

    if (methodType !== "link") {
      if (!recipientName.trim()) {
        errs.recipientName = "Укажите имя получателя";
      }
      if (bank === "other" && !bankName.trim()) {
        errs.bankName = "Укажите название банка";
      }
    }

    setFieldErrors(errs);
    return { isValid: Object.keys(errs).length === 0, errors: errs };
  };

  const executeSaveMethod = async (): Promise<string | null> => {
    let cleanVal = value.trim();

    if (methodType === "card") {
      cleanVal = cleanVal.replace(/\D/g, "");
    } else if (methodType === "phone") {
      cleanVal = cleanPhone(cleanVal);
    } else if (methodType === "link") {
      if (!cleanVal.startsWith("http://") && !cleanVal.startsWith("https://")) {
        cleanVal = "https://" + cleanVal;
      }
    }

    try {
      const created = await createMethod.mutateAsync({
        type: methodType,
        bank: methodType === "link" ? null : bank,
        bank_name: methodType !== "link" && bank === "other" ? bankName.trim() : null,
        value: cleanVal,
        recipient_name: methodType === "link" ? null : recipientName.trim(),
      });

      if (created?.id) {
        const nextIds = selectedIds.includes(created.id) ? selectedIds : [...selectedIds, created.id];
        onChange(nextIds);
        toast.success("Способ оплаты добавлен");
        resetForm();
        return created.id;
      }
    } catch (err: any) {
      toast.error(err?.message || "Ошибка при сохранении способа оплаты");
    }
    return null;
  };

  const handleSaveClick = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const { isValid, errors } = validateEditorFields();
    if (!isValid) {
      const firstFieldId = errors.value
        ? "payment-field-value"
        : errors.recipientName
        ? "payment-field-recipient"
        : errors.bankName
        ? "payment-field-bank-name"
        : "payment-method-editor";
      const el = document.getElementById(firstFieldId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
      return;
    }

    await executeSaveMethod();
  };

  useImperativeHandle(ref, () => ({
    isEditorOpen: () => isAdding,
    saveIfOpen: async () => {
      if (!isAdding) {
        return { saved: false, hasErrors: false };
      }
      const { isValid, errors } = validateEditorFields();
      if (!isValid) {
        const firstFieldId = errors.value
          ? "payment-field-value"
          : errors.recipientName
          ? "payment-field-recipient"
          : errors.bankName
          ? "payment-field-bank-name"
          : "payment-method-editor";
        const el = document.getElementById(firstFieldId);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
        return { saved: false, hasErrors: true };
      }

      const savedId = await executeSaveMethod();
      if (savedId) {
        return { saved: true, methodId: savedId, hasErrors: false };
      }
      return { saved: false, hasErrors: true };
    },
  }));

  return (
    <div className="space-y-4 pt-4 border-t border-border/70">
      <div id="field-payment-methods" className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-1.5">
              Способы оплаты {isPaid && <span className="text-destructive">*</span>}
            </Label>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Отметьте способы, доступные покупателям для этого продукта
            </p>
          </div>

          {!isAdding && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAdding(true);
                setFieldErrors({});
              }}
              className="rounded-xl border-dashed border-primary/50 text-primary hover:bg-primary/5 h-9 gap-1.5 text-xs sm:text-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить способ
            </Button>
          )}
        </div>

        {/* Single inline error message beneath the Способы оплаты heading, shown only after submit attempt */}
        {hasSubmitAttempt && errorMessage && (
          <p className="text-xs sm:text-sm font-medium text-destructive mt-2 flex items-center gap-1.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </p>
        )}
      </div>

      {/* Saved methods checkbox list */}
      {isLoading ? (
        <div className="flex items-center justify-center p-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Загрузка способов оплаты...</span>
        </div>
      ) : savedMethods.length === 0 && !isAdding ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-6 text-center space-y-2 bg-muted/20">
          <p className="text-sm text-muted-foreground">
            У вас пока нет сохранённых способов оплаты.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsAdding(true);
              setFieldErrors({});
            }}
            className="h-11 min-h-[44px] rounded-xl gap-1.5 font-medium px-4"
          >
            <Plus className="w-4 h-4" />
            Добавить первый способ
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {savedMethods.map((pm) => {
            if (!pm) return null;
            const isChecked = Array.isArray(selectedIds) && selectedIds.includes(pm.id);
            const bankLabel = getBankDisplayName(pm.bank, pm.bank_name);

            return (
              <div
                key={pm.id}
                role="checkbox"
                aria-checked={isChecked}
                tabIndex={0}
                onClick={() => handleToggle(pm.id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    handleToggle(pm.id);
                  }
                }}
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isChecked
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                    : "border-border/80 bg-card hover:bg-muted/30"
                )}
              >
                <div className="pt-0.5">
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors",
                      isChecked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 bg-transparent"
                    )}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1"
                      style={{ fontFamily: EMOJI_FONT_STACK }}
                    >
                      {pm.type === "link" && "🔗 Ссылка"}
                      {pm.type === "phone" && "📱 Телефон"}
                      {pm.type === "card" && "💳 Карта"}
                    </span>

                    {bankLabel && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/60">
                        {bankLabel}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 font-mono text-sm text-foreground tracking-wide font-medium">
                    {pm.type === "card"
                      ? maskCardNumber(pm.value)
                      : pm.type === "phone"
                      ? formatPhoneInput(pm.value)
                      : (pm.value || "")}
                  </div>

                  {pm.recipient_name && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Имя получателя: <span className="font-medium text-foreground">{pm.recipient_name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Container (not a form!) to Add a New Payment Method */}
      {isAdding && (
        <div
          id="payment-method-editor"
          className="rounded-2xl border-2 border-primary/30 bg-card p-4 sm:p-5 space-y-4 shadow-sm animate-fade-in"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <h4 className="font-semibold text-sm sm:text-base text-foreground">Новый способ оплаты</h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-full"
              onClick={resetForm}
              aria-label="Закрыть"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>

          {/* Type Buttons: exactly "🔗 Ссылка", "📱 Телефон", "💳 Карта" */}
          <div className="space-y-1.5">
            <Label className="text-xs sm:text-sm font-medium text-muted-foreground">Тип способа</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMethodType("link");
                  setFieldErrors({});
                  setValue("");
                }}
                style={{ fontFamily: EMOJI_FONT_STACK }}
                className={cn(
                  "h-11 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  methodType === "link"
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 hover:bg-muted text-foreground border-border/80"
                )}
              >
                🔗 Ссылка
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethodType("phone");
                  setFieldErrors({});
                  setValue("");
                }}
                style={{ fontFamily: EMOJI_FONT_STACK }}
                className={cn(
                  "h-11 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  methodType === "phone"
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 hover:bg-muted text-foreground border-border/80"
                )}
              >
                📱 Телефон
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethodType("card");
                  setFieldErrors({});
                  setValue("");
                }}
                style={{ fontFamily: EMOJI_FONT_STACK }}
                className={cn(
                  "h-11 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  methodType === "card"
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 hover:bg-muted text-foreground border-border/80"
                )}
              >
                💳 Карта
              </button>
            </div>
          </div>

          {/* Bank row for Phone and Card */}
          {methodType !== "link" && (
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-medium text-muted-foreground">Банк</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: "kaspi" as const, label: "Kaspi" },
                  { key: "halyk" as const, label: "Halyk" },
                  { key: "freedom" as const, label: "Freedom" },
                  { key: "other" as const, label: "Другой банк" },
                ].map((b) => (
                  <Button
                    key={b.key}
                    type="button"
                    variant={bank === b.key ? "default" : "toggle"}
                    onClick={() => {
                      setBank(b.key);
                      if (b.key !== "other") {
                        setFieldErrors((prev) => ({ ...prev, bankName: undefined }));
                      }
                    }}
                    className="h-11 min-h-[44px] text-xs sm:text-sm rounded-xl font-medium"
                  >
                    {b.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* If "Другой банк", reveals required bank-name field */}
          {methodType !== "link" && bank === "other" && (
            <div className="space-y-1.5 animate-fade-in">
              <Label className="text-xs sm:text-sm font-medium text-foreground">
                Название банка <span className="text-destructive">*</span>
              </Label>
              <Input
                id="payment-field-bank-name"
                type="text"
                placeholder="Например, ForteBank, Bereke..."
                value={bankName}
                onChange={(e) => {
                  setBankName(e.target.value);
                  if (fieldErrors.bankName) {
                    setFieldErrors((prev) => ({ ...prev, bankName: undefined }));
                  }
                }}
                className={cn(
                  "h-11 rounded-xl text-base",
                  fieldErrors.bankName && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {fieldErrors.bankName && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fieldErrors.bankName}</span>
                </p>
              )}
            </div>
          )}

          {/* Required "Имя получателя" field hinted "как в банковском приложении" for phone & card */}
          {methodType !== "link" && (
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-medium text-foreground">
                Имя получателя <span className="text-destructive">*</span>
              </Label>
              <Input
                id="payment-field-recipient"
                type="text"
                placeholder="как в банковском приложении"
                value={recipientName}
                onChange={(e) => {
                  setRecipientName(e.target.value);
                  if (fieldErrors.recipientName) {
                    setFieldErrors((prev) => ({ ...prev, recipientName: undefined }));
                  }
                }}
                className={cn(
                  "h-11 rounded-xl text-base",
                  fieldErrors.recipientName && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {fieldErrors.recipientName ? (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fieldErrors.recipientName}</span>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">как в банковском приложении</p>
              )}
            </div>
          )}

          {/* Value Field */}
          {methodType === "card" && (
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-medium text-foreground">
                Номер карты (16 цифр) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="payment-field-value"
                type="text"
                inputMode="numeric"
                placeholder="4400 0000 0000 0000"
                value={formatCardInput(value)}
                onChange={(e) => {
                  if (fieldErrors.value) {
                    setFieldErrors((prev) => ({ ...prev, value: undefined }));
                  }
                  setValue(e.target.value.replace(/\D/g, "").slice(0, 16));
                }}
                className={cn(
                  "h-11 rounded-xl text-base font-mono tracking-wider",
                  fieldErrors.value && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {fieldErrors.value && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fieldErrors.value}</span>
                </p>
              )}
            </div>
          )}

          {methodType === "phone" && (
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-medium text-foreground">
                Номер телефона <span className="text-destructive">*</span>
              </Label>
              <PhoneInput
                id="payment-field-value"
                placeholder="701 123 45 67"
                value={value}
                onChange={(formatted) => {
                  if (fieldErrors.value) {
                    setFieldErrors((prev) => ({ ...prev, value: undefined }));
                  }
                  setValue(formatted);
                }}
                hasError={!!fieldErrors.value}
              />
              {fieldErrors.value && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fieldErrors.value}</span>
                </p>
              )}
            </div>
          )}

          {methodType === "link" && (
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-medium text-foreground">
                Ссылка на оплату <span className="text-destructive">*</span>
              </Label>
              <Input
                id="payment-field-value"
                type="text"
                placeholder="https://pay.kaspi.kz/..."
                value={value}
                onChange={(e) => {
                  if (fieldErrors.value) {
                    setFieldErrors((prev) => ({ ...prev, value: undefined }));
                  }
                  setValue(e.target.value);
                }}
                className={cn(
                  "h-11 rounded-xl text-base",
                  fieldErrors.value && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {fieldErrors.value && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fieldErrors.value}</span>
                </p>
              )}
            </div>
          )}

          {/* Actions: all type="button", never submit outer form */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              className="h-11 min-h-[44px] rounded-xl px-4"
              disabled={createMethod.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={createMethod.isPending}
              className="h-11 min-h-[44px] rounded-xl px-4 bg-primary text-primary-foreground font-semibold gap-1.5"
            >
              {createMethod.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Сохранить и выбрать
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

ProductPaymentMethodsSection.displayName = "ProductPaymentMethodsSection";

export default ProductPaymentMethodsSection;
