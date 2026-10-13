import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, CheckCircle2, XCircle, Clock, ImagePlus, Info } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { FunctionInvokeError, invokeForm } from "@/lib/sessionApi";
import { allowsReceiptRetry } from "@/lib/paymentReview";
import { toast } from "sonner";

export type ReceiptSubmission = {
  id: string
  verification_status: "pending" | "confirmed" | "rejected" | "manual_review" | "payment_qr_or_invoice" | "unreadable" | string
  rejection_reason: string | null
  detected_amount?: number | null
  created_at?: string
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf"
const MAX_BYTES = 4 * 1024 * 1024

type Props = {
  purchaseId: string
  sessionToken: string
  expectedAmount: number
  submission: ReceiptSubmission | null
  onSubmitted: (result: {
    verification_status: string
    purchase_status: string
    rejection_reason: string | null
    expected_amount?: number
    detected_amount?: number | null
    submission: ReceiptSubmission | null
  }) => void
}

function reasonText(
  t: (k: string, params?: Record<string, string | number>) => string,
): string {
  return t("receiptRejectedGeneric")
}

const ReceiptUploadCard = ({ purchaseId, sessionToken, expectedAmount, submission, onSubmitted }: Props) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const status = submission?.verification_status;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const takeFile = useCallback((next: File | null) => {
    if (!next) return;
    if (next.size > MAX_BYTES) {
      toast.error(t("receiptTooLarge"));
      return;
    }
    if (!ACCEPT.split(",").includes(next.type) && !next.type.startsWith("image/")) {
      toast.error(t("receiptUnsupportedType"));
      return;
    }
    setFile(next);
    if (preview) URL.revokeObjectURL(preview);
    if (next.type.startsWith("image/")) setPreview(URL.createObjectURL(next));
    else setPreview(null);
  }, [preview, t]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      const blob = item?.getAsFile();
      if (blob) {
        e.preventDefault();
        takeFile(new File([blob], "pasted-receipt.png", { type: blob.type || "image/png" }));
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [takeFile]);

  const upload = async () => {
    if (!file) {
      toast.error(t("receiptChooseFile"));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("sessionToken", sessionToken);
      form.append("purchaseId", purchaseId);
      form.append("file", file);
      const result = await invokeForm<{
        verification_status: string
        purchase_status: string
        rejection_reason: string | null
        expected_amount?: number
        detected_amount?: number | null
        submission: ReceiptSubmission | null
      }>("submit-payment-receipt", form, {
        "x-dostup-session": sessionToken,
      });
      onSubmitted(result);
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (result.verification_status === "confirmed") toast.success(t("accessGranted"));
      else if (result.verification_status === "payment_qr_or_invoice") toast.message(t("receiptPayFirstTitle"));
      else if (result.verification_status === "unreadable") toast.message(t("receiptUnreadableTitle"));
      else if (result.verification_status === "rejected") {
        toast.error(reasonText(t));
      } else if (result.verification_status === "manual_review") toast.success(t("receiptSentToast"));
    } catch (err) {
      const message = err instanceof FunctionInvokeError
        ? err.message
        : err instanceof Error && err.message
          ? err.message
          : t("receiptUploadFailed")
      console.error("receipt upload failed", err)
      toast.error(message)
    } finally {
      setUploading(false);
    }
  };

  if (status === "confirmed") {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-left">
        <div className="flex items-center gap-2 text-success font-medium">
          <CheckCircle2 className="w-5 h-5" />
          {t("receiptConfirmedTitle")}
        </div>
        <p className="text-sm text-muted-foreground mt-2">{t("receiptConfirmedBody")}</p>
      </div>
    );
  }

  if (status === "manual_review") {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-left">
        <div className="flex items-center gap-2 text-warning font-medium">
          <Clock className="w-5 h-5" />
          {t("receiptManualReviewTitle")}
        </div>
        <p className="text-sm text-muted-foreground mt-2">{t("receiptManualReviewBody")}</p>
      </div>
    );
  }

  const showRetryBanner = status === "rejected" || status === "payment_qr_or_invoice" || status === "unreadable";

  return (
    <div className="space-y-4 text-left">
      {showRetryBanner && (
        <div className={`rounded-lg border p-4 ${
          status === "rejected"
            ? "border-destructive/30 bg-destructive/5"
            : "border-primary/30 bg-primary/5"
        }`}>
          <div className={`flex items-center gap-2 font-medium ${
            status === "rejected" ? "text-destructive" : "text-foreground"
          }`}>
            {status === "rejected" ? <XCircle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            {status === "payment_qr_or_invoice"
              ? t("receiptPayFirstTitle")
              : t("receiptRejectedTitle")}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {status === "payment_qr_or_invoice"
              ? t("receiptPayFirstBody")
              : reasonText(t)}
          </p>
        </div>
      )}

      {allowsReceiptRetry(status) && (
      <div className="rounded-lg border border-dashed border-input bg-muted/30 p-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => takeFile(e.target.files?.[0] || null)}
        />
        {preview && (
          <img src={preview} alt="" className="w-full max-h-48 object-contain rounded-md mb-3 bg-background" />
        )}
        {file && !preview && (
          <p className="text-xs text-muted-foreground mb-3">{file.name}</p>
        )}
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-4 h-4 mr-2" />
            {file ? t("receiptChooseAnother") : t("receiptChooseFile")}
          </Button>
          <Button type="button" className="w-full" disabled={!file || uploading} onClick={upload}>
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("receiptProcessing")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                {t("uploadPaymentReceipt")}
              </span>
            )}
          </Button>
        </div>
      </div>
      )}
    </div>
  );
};

export default ReceiptUploadCard;
