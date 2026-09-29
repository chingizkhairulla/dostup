import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { kk, ru } from "date-fns/locale";
import { CalendarClock, ChevronDown, Download, FileText, Loader2, Package, Receipt, Users, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import MediaViewer from "@/components/media/MediaViewer";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatPriceTenge } from "@/lib/catalog";
import { fetchCreatorReceiptBlob } from "@/lib/sessionApi";
import { cn } from "@/lib/utils";
import { accessEnd, accessUrgency, URGENCY_CLASSES, type AccessSource } from "./buyerAccess";

export interface BuyerReceipt {
  id: string;
  verification_status: string;
  detected_amount: number | null;
  receipt_mime_type: string | null;
  created_at: string;
}

export interface BuyerPurchase extends AccessSource {
  id: string;
  amount: number;
  product_id: string;
  assigned_teacher_id: string | null;
  can_choose_teacher: boolean | null;
  simple_user: { id: string; name: string; phone: string };
  product: { title: string };
  receipts: BuyerReceipt[];
}

interface Props {
  purchase: BuyerPurchase | null;
  onOpenChange: (open: boolean) => void;
  onRevokeAccess: (purchaseId: string) => Promise<void>;
  teachers: { id: string; name: string }[];
  teacherValue: string;
  onTeacherChange: (value: string) => void;
}

export const UrgencyBadge = ({ purchase, className }: { purchase: AccessSource; className?: string }) => {
  const { t } = useLanguage();
  const { urgency, daysLeft } = accessUrgency(purchase);
  const label =
    urgency === "forever"
      ? t("buyerAccessForever")
      : urgency === "closed"
        ? t("buyerAccessClosed")
        : urgency === "expired"
          ? t("buyerAccessExpired")
          : `${t(urgency === "far" ? "buyerUrgencyFar" : urgency === "soon" ? "buyerUrgencySoon" : "buyerUrgencyVerySoon")} · ${t("buyerDaysLeft", { count: daysLeft ?? 0 })}`;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", URGENCY_CLASSES[urgency], className)}>
      {label}
    </span>
  );
};

/** Seller's card for one buyer: last payment, access status, receipts and a button to close access. */
const BuyerDetailsDialog = ({ purchase, onOpenChange, onRevokeAccess, teachers, teacherValue, onTeacherChange }: Props) => {
  const { t, language } = useLanguage();
  const locale = language === "kk" ? kk : ru;
  const [saving, setSaving] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [receiptView, setReceiptView] = useState<{ url: string; kind: "image" | "pdf"; name: string } | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState<string | null>(null);

  useEffect(() => {
    setConfirmRevoke(false);
    setReceiptsOpen(false);
  }, [purchase?.id]);

  useEffect(() => () => {
    if (receiptView) URL.revokeObjectURL(receiptView.url);
  }, [receiptView]);

  const paidAt = useMemo(() => (purchase ? new Date(purchase.created_at) : new Date()), [purchase]);
  if (!purchase) return null;

  const end = accessEnd(purchase);
  const isSubscription = !!purchase.subscription;
  const { urgency } = accessUrgency(purchase);
  const fmt = (d: Date) => format(d, "d MMMM yyyy", { locale });

  const revoke = async () => {
    setSaving(true);
    try {
      await onRevokeAccess(purchase.id);
      toast.success(t("buyerAccessClosed"));
    } catch {
      toast.error(t("buyerAccessSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = async (receipt: BuyerReceipt) => {
    setLoadingReceipt(receipt.id);
    try {
      const blob = await fetchCreatorReceiptBlob(receipt.id);
      const mime = receipt.receipt_mime_type || blob.type;
      setReceiptView({
        url: URL.createObjectURL(blob),
        kind: mime.includes("pdf") ? "pdf" : "image",
        name: `${t("buyerReceipt")} ${format(new Date(receipt.created_at), "dd.MM.yyyy")}`,
      });
    } catch {
      toast.error(t("buyerReceiptError"));
    } finally {
      setLoadingReceipt(null);
    }
  };

  const downloadReceipt = () => {
    if (!receiptView) return;
    const a = document.createElement("a");
    a.href = receiptView.url;
    a.download = `${receiptView.name.replace(/\s+/g, "_")}.${receiptView.kind === "pdf" ? "pdf" : "jpg"}`;
    a.click();
  };

  return (
    <>
      <Dialog open={!!purchase} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl sm:rounded-2xl"
        >
          {/* On a computer the card closes by clicking outside or Esc; phones keep the cross. */}
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-ring md:hidden">
            <X className="h-4 w-4" />
            <span className="sr-only">{t("close")}</span>
          </DialogClose>
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-3 pr-6 md:pr-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {purchase.simple_user.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 break-words">{purchase.simple_user.name}</span>
            </DialogTitle>
          </DialogHeader>

          <dl className="space-y-3 text-sm">
            <Row icon={Package} label={t("buyerProduct")}>
              {purchase.product.title}
            </Row>
            <Row icon={Wallet} label={t("buyerPaid")}>
              {formatPriceTenge(Number(purchase.amount))} · {fmt(paidAt)}
            </Row>
            <Row icon={CalendarClock} label={isSubscription ? t("buyerNextPayment") : t("buyerAccessUntil")}>
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {urgency === "closed"
                    ? t("buyerAccessClosed")
                    : urgency === "forever" || !end
                      ? t("buyerAccessForever")
                      : fmt(end)}
                </span>
                <UrgencyBadge purchase={purchase} />
              </span>
            </Row>
          </dl>

          {urgency !== "closed" && (
            <Button
              variant="destructive"
              className="h-10 w-full"
              disabled={saving}
              onClick={() => setConfirmRevoke(true)}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("revokeAccess")}
            </Button>
          )}

          {teachers.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                {t("buyerTeacher")}
              </p>
              <Select value={teacherValue} onValueChange={onTeacherChange}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="author">{t("buyerTeacherAuthor")}</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="choose">{t("buyerTeacherChoose")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            {purchase.receipts.length === 0 ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  {t("buyerReceipts")}
                </p>
                <p className="text-sm text-muted-foreground">{t("buyerNoReceipts")}</p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setReceiptsOpen((v) => !v)}
                aria-expanded={receiptsOpen}
                className="flex items-center gap-2 rounded-sm text-sm font-medium focus-ring"
              >
                <Receipt className="h-4 w-4 text-muted-foreground" />
                {t("buyerReceipts")}
                <span className="text-muted-foreground">{purchase.receipts.length}</span>
                <ChevronDown
                  className={cn("h-4 w-4 text-muted-foreground transition-transform", receiptsOpen && "rotate-180")}
                />
              </button>
            )}
            {receiptsOpen && purchase.receipts.length > 0 && (
              <ul className="space-y-1.5">
                {purchase.receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <button
                      type="button"
                      onClick={() => void openReceipt(receipt)}
                      disabled={loadingReceipt === receipt.id}
                      className="flex w-full items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted focus-ring"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {loadingReceipt === receipt.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {format(new Date(receipt.created_at), "d MMMM yyyy, HH:mm", { locale })}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {receipt.detected_amount != null ? `${formatPriceTenge(Number(receipt.detected_amount))} · ` : ""}
                          {t(`buyerReceiptStatus_${receipt.verification_status}` as "buyerReceiptStatus_confirmed")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MediaViewer
        items={receiptView ? [{ kind: receiptView.kind, url: receiptView.url, name: receiptView.name }] : []}
        index={receiptView ? 0 : null}
        onIndexChange={(i) => i === null && setReceiptView(null)}
        light
        actions={
          <Button variant="outline" className="h-10 gap-2 rounded-full px-4" onClick={downloadReceipt}>
            <Download className="h-4 w-4" />
            {t("download")}
          </Button>
        }
      />

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("buyerRevokeConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{purchase.simple_user.name}</strong> · {purchase.product.title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void revoke()}
            >
              {t("revokeAccess")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const Row = ({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Package;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-start gap-3">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium text-foreground">{children}</dd>
    </div>
  </div>
);

export default BuyerDetailsDialog;
