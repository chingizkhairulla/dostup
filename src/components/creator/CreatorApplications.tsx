import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, ChevronDown, ChevronUp, Loader2, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";
import { cn } from "@/lib/utils";

export interface Application {
  id: string;
  product_id: string;
  buyer_profile_id: string;
  status: "pending" | "allowed" | "closed";
  applied_at: string;
  pay_until: string | null;
  name: string;
  avatar_url: string | null;
}

export function useApplications(enabled = true) {
  return useQuery({
    queryKey: ["creator-applications"],
    queryFn: async () =>
      (await invokeApi<{ applications: Application[] }>("manage-products", { action: "list_applications", ...creatorCreds() }))
        .applications ?? [],
    enabled,
  });
}

const decide = (applicationId: string, decision: "allow" | "waitlist" | "close_payment" | "remove", message?: string) =>
  invokeApi("manage-products", { action: "decide_application", ...creatorCreds(), applicationId, decision, message });

const appliedLabel = (a: Application) => format(new Date(a.applied_at), "d MMMM yyyy", { locale: ru });

/** White button, light orange on hover; on a phone only its icon shows. */
const ActionButton = ({
  icon: Icon,
  label,
  onClick,
  busy,
}: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  busy?: boolean;
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    disabled={busy}
    title={label}
    aria-label={label}
    className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-60"
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

const Avatar = ({ a }: { a: Application }) => (
  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
    {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-full w-full object-cover" /> : a.name.charAt(0).toUpperCase()}
  </div>
);

/** "Ожидающие": people who asked to pay after their trial. */
export const PendingApplicationCards = ({
  applications,
  productTitle,
}: {
  applications: Application[];
  /** Set when every product is listed, so the card says which one. */
  productTitle?: (productId: string) => string | undefined;
}) => {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [waitlistFor, setWaitlistFor] = useState<Application | null>(null);

  const allow = async (a: Application) => {
    setBusyId(a.id);
    try {
      await decide(a.id, "allow");
      await queryClient.invalidateQueries({ queryKey: ["creator-applications"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {applications.map((a) => (
        <Card key={a.id} className="animate-fade-in">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Avatar a={a} />
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-medium text-foreground">{a.name}</h4>
                <p className="truncate text-xs text-muted-foreground">
                  С пробного доступа · {appliedLabel(a)}
                  {productTitle?.(a.product_id) ? ` · ${productTitle(a.product_id)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <ActionButton icon={Check} label="Разрешить оплату" onClick={() => void allow(a)} busy={busyId === a.id} />
                <ActionButton icon={X} label="В лист ожидания" onClick={() => setWaitlistFor(a)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <WaitlistReasonDialog application={waitlistFor} onClose={() => setWaitlistFor(null)} />
    </>
  );
};

const REASONS = [
  { label: "Набрал(а) достаточно учеников", text: "Здравствуйте, у меня полная запись, к сожалению я не смогу вас взять" },
  { label: "Время занятий не подходит", text: "Здравствуйте, к сожалению, мне не подходит время занятий" },
  { label: "Решил(а) взять перерыв", text: "Здравствуйте, я решила временно приостановить работу. Спасибо за понимание" },
  { label: "Другая причина", text: "" },
];

/** "В лист ожидания": a reason and the personal message the buyer gets (no platform notification). */
const WaitlistReasonDialog = ({ application, onClose }: { application: Application | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(0);
  const [message, setMessage] = useState(REASONS[0].text);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!application) return;
    setReason(0);
    setMessage(REASONS[0].text);
  }, [application]);

  const send = async () => {
    if (!application) return;
    setBusy(true);
    try {
      await decide(application.id, "waitlist", message.trim());
      await queryClient.invalidateQueries({ queryKey: ["creator-applications"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!application} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-md gap-4 rounded-2xl">
        <DialogTitle className="text-lg">В лист ожидания</DialogTitle>
        <DialogDescription>
          После “Отправить” людей переносит в “Лист ожидания”, где вы сможете всегда разрешить им оплату
        </DialogDescription>
        <div className="space-y-1.5" role="radiogroup">
          {REASONS.map((r, i) => (
            <button
              key={r.label}
              type="button"
              role="radio"
              aria-checked={reason === i}
              onClick={() => {
                setReason(i);
                setMessage(r.text);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-primary/10"
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  reason === i ? "border-primary bg-primary" : "border-muted-foreground/40",
                )}
              >
                {reason === i && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              {r.label}
            </button>
          ))}
        </div>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={4000} />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !message.trim()}
            className="flex h-10 min-w-28 items-center justify-center rounded-xl bg-[#FF6B00] px-5 text-sm font-semibold text-white hover:bg-[#E86000] disabled:bg-muted disabled:text-muted-foreground"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отправить"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** "Лист ожидания": between "Активные" and "Неактивные", shown only when someone is in it. */
export const WaitlistSection = ({
  applications,
  productTitle,
  settingsProduct,
}: {
  applications: Application[];
  productTitle?: (productId: string) => string | undefined;
  /** A "Период времени" product: the gear opens its auto-opening settings. */
  settingsProduct?: { id: string; waitlist_auto_open?: boolean; waitlist_pay_days?: number } | null;
}) => {
  const [opened, setOpened] = useState<Application | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!applications.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-semibold text-foreground">Лист ожидания</h3>
          {settingsProduct && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Настройки листа ожидания"
              title="Настройки листа ожидания"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
        <span className="text-sm text-muted-foreground">{applications.length}</span>
      </div>
      {applications.map((a) => (
        <Card
          key={a.id}
          role="button"
          tabIndex={0}
          onClick={() => setOpened(a)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpened(a)}
          className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/40 focus-ring"
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Avatar a={a} />
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-medium text-foreground">{a.name}</h4>
                <p className="truncate text-xs text-muted-foreground">
                  {appliedLabel(a)}
                  {productTitle?.(a.product_id) ? ` · ${productTitle(a.product_id)}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  a.status === "allowed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {a.status === "allowed" ? "Могут оплатить" : "Оплата закрыта"}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
      <WaitlistCardDialog application={opened} onClose={() => setOpened(null)} />
      {settingsProduct && (
        <WaitlistSettingsDialog product={settingsProduct} open={settingsOpen} onOpenChange={setSettingsOpen} />
      )}
    </div>
  );
};

/** A card in the waiting list: close the payment again, allow it, or remove the person for good. */
const WaitlistCardDialog = ({ application, onClose }: { application: Application | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => setConfirmRemove(false), [application]);

  const run = async (decision: "allow" | "close_payment" | "remove") => {
    if (!application) return;
    setBusy(decision);
    try {
      await decide(application.id, decision);
      await queryClient.invalidateQueries({ queryKey: ["creator-applications"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  };

  const plain =
    "flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-60";

  return (
    <Dialog open={!!application} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideCloseButton
        className="max-w-md gap-4 rounded-2xl"
        // The "remove" step has a red button: it closes only with the cross.
        onInteractOutside={(e) => confirmRemove && e.preventDefault()}
      >
        {confirmRemove ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              title="Изменения не сохранятся"
              aria-label="Закрыть"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <DialogTitle className="pr-8 text-lg">{application?.name}</DialogTitle>
            <DialogDescription className="text-sm text-foreground">
              Если вы уберете человека, то он больше не сможет воспользоваться пробным или приобрести ваш продукт. Так же
              ему придет уведомление, о том что его убрали из листа ожидания. Используйте это только если вы точно не
              хотите, чтобы он когда-либо стал вашим покупателем
            </DialogDescription>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void run("remove")}
                disabled={busy !== null}
                className="flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Убрать из листа ожидания"}
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle className="text-lg">{application?.name}</DialogTitle>
            <DialogDescription>
              {application?.status === "allowed" ? "Могут оплатить" : "Оплата закрыта"}
              {application ? ` · ${appliedLabel(application)}` : ""}
            </DialogDescription>
            <div className="flex flex-wrap justify-end gap-2">
              {application?.status === "allowed" ? (
                <button type="button" className={plain} disabled={busy !== null} onClick={() => void run("close_payment")}>
                  {busy === "close_payment" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Закрыть оплату"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Убрать из листа
                  </button>
                  <button type="button" className={plain} disabled={busy !== null} onClick={() => void run("allow")}>
                    {busy === "allow" ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <>
                        <Check className="h-4 w-4" />
                        Разрешить оплату
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const DAY_OPTIONS = [3, 14];

/** The gear next to "Лист ожидания" ("Период времени" only): automatic opening and the time to pay. */
const WaitlistSettingsDialog = ({
  product,
  open,
  onOpenChange,
}: {
  product: { id: string; waitlist_auto_open?: boolean; waitlist_pay_days?: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [auto, setAuto] = useState(Boolean(product.waitlist_auto_open));
  const [days, setDays] = useState(String(product.waitlist_pay_days ?? 7));

  useEffect(() => {
    if (!open) return;
    setAuto(Boolean(product.waitlist_auto_open));
    setDays(String(product.waitlist_pay_days ?? 7));
  }, [open, product.waitlist_auto_open, product.waitlist_pay_days]);

  // Saved as it changes, like any small window.
  const save = async (patch: { autoOpen?: boolean; payDays?: number }) => {
    try {
      await invokeApi("manage-products", { action: "waitlist_settings", ...creatorCreds(), productId: product.id, ...patch });
      void queryClient.invalidateQueries({ queryKey: ["creator-products"] });
      void queryClient.invalidateQueries({ queryKey: ["creator-applications"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  const setDaysValue = (value: number) => {
    const next = Math.min(365, Math.max(1, value));
    setDays(String(next));
    void save({ payDays: next });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="max-w-md gap-4 rounded-2xl">
        <DialogTitle className="sr-only">Лист ожидания</DialogTitle>
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span className="text-sm font-semibold">Автоматически открывать оплату при появлении места</span>
          <Switch
            checked={auto}
            onCheckedChange={(v) => {
              setAuto(v);
              void save({ autoOpen: v });
            }}
          />
        </label>
        {auto && (
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">Время на оплату:</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 items-center gap-1 rounded-xl border border-input bg-background pl-3 pr-1">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Дней на оплату"
                  value={days}
                  onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onBlur={() => setDaysValue(Number(days) || 7)}
                  className="h-full w-12 bg-transparent text-sm outline-none"
                />
                <div className="flex h-8 w-6 flex-col overflow-hidden rounded-md bg-muted">
                  <button type="button" aria-label="Больше" onClick={() => setDaysValue((Number(days) || 0) + 1)} className="flex h-1/2 items-center justify-center hover:bg-primary/10">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Меньше" onClick={() => setDaysValue((Number(days) || 2) - 1)} className="flex h-1/2 items-center justify-center hover:bg-primary/10">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">дн.</span>
              {DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysValue(d)}
                  className={cn(
                    "h-9 rounded-xl border px-3 text-sm transition-colors",
                    Number(days) === d ? "border-primary bg-primary text-white" : "border-border bg-background hover:bg-primary/10",
                  )}
                >
                  {d} {d === 3 ? "дня" : "дней"}
                </button>
              ))}
            </div>
          </div>
        )}
        <DialogDescription className="text-xs">
          {auto
            ? "При выключении, оплата не будет открываться и закрываться автоматически. Вы сможете сделать это только вручную"
            : "При включении, оплата будет автоматически открываться и закрываться по окончанию времени"}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
};
