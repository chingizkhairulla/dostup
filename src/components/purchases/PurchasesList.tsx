import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { kk, ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import ProductCover from "@/components/marketplace/ProductCover";
import ReviewProductDialog from "@/components/reviews/ReviewProductDialog";
import { Stars } from "@/components/reviews/ReviewItem";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProductReviews } from "@/hooks/useProductReviews";
import {
  billingPeriodLabel,
  formatPriceTenge,
  productHref,
  type BillingPeriod,
  type CatalogProduct,
} from "@/lib/catalog";
import type { PaymentState, PurchaseRowData } from "@/lib/purchasePayment";
import { cn } from "@/lib/utils";

// Desktop columns: product, price, date, payment, review. Header and rows share this template.
const DESKTOP_GRID = "md:grid md:grid-cols-[minmax(0,2.4fr)_1fr_1fr_1.2fr_1.2fr] md:items-center md:gap-4";

interface PurchasesListProps {
  rows: Array<{ data: PurchaseRowData; product: CatalogProduct }>;
}

const PurchasesList = ({ rows }: PurchasesListProps) => {
  const { t } = useLanguage();

  return (
    <div className="w-full min-w-0">
      <div
        className={cn(
          "hidden border-b border-border pb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground",
          DESKTOP_GRID,
        )}
      >
        <span>{t("purchasesColProduct")}</span>
        <span>{t("purchasesColPrice")}</span>
        <span>{t("purchasesColDate")}</span>
        <span>{t("purchasesColPayment")}</span>
        <span>{t("purchasesColReview")}</span>
      </div>

      {rows.map(({ data, product }) => (
        <PurchaseRow key={product.id} data={data} product={product} />
      ))}
    </div>
  );
};

interface PurchaseRowProps {
  data: PurchaseRowData;
  product: CatalogProduct;
}

const PurchaseRow = ({ data, product }: PurchaseRowProps) => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const locale = language === "kk" ? kk : ru;

  const coverUrl = product.media?.find((m) => m.type === "image")?.url ?? product.image_url;
  const periodLabel = data.billingPeriod
    ? ` ${billingPeriodLabel(data.billingPeriod as BillingPeriod, language)}`
    : "";
  const payNow = () => navigate(`/checkout/${product.id}?renew=1`);

  return (
    <div className={cn("border-b border-border py-4", DESKTOP_GRID)}>
      <Link
        to={productHref(product)}
        className="group flex min-w-0 items-center gap-4 rounded-lg focus-ring"
      >
        <div className="aspect-[16/10] w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
          <ProductCover
            productId={product.id}
            title={product.title}
            imageUrl={coverUrl}
            emoji={product.category_emoji}
          />
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 font-medium text-foreground group-hover:underline">
            {product.title}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {product.seller_display_name || t("author")}
          </p>
        </div>
      </Link>

      {/* Mobile: a 2-column grid under the product. Desktop: `md:contents` lets these cells sit directly in the row grid. */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:mt-0 md:contents">
        <Cell label={t("purchasesColPrice")}>
          <p className="text-sm font-medium tabular-nums text-foreground">
            {`${formatPriceTenge(data.amount || product.price)}${periodLabel}`}
          </p>
        </Cell>
        <Cell label={t("purchasesColDate")}>
          <p className="text-sm text-foreground">
            {format(data.purchasedAt, "d MMM yyyy", { locale })}
          </p>
        </Cell>
        <Cell label={t("purchasesColPayment")}>
          <PaymentInfo
            payment={data.payment}
            isSubscription={product.category_slug === "subscriptions"}
            onPay={payNow}
          />
        </Cell>
        <Cell label={t("purchasesColReview")}>
          <ReviewCell productId={product.id} productTitle={product.title} />
        </Cell>
      </div>
    </div>
  );
};

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground md:hidden">{label}</p>
    {children}
  </div>
);

const PaymentInfo = ({
  payment,
  isSubscription,
  onPay,
}: {
  payment: PaymentState;
  isSubscription: boolean;
  onPay: () => void;
}) => {
  const { t, language } = useLanguage();
  const locale = language === "kk" ? kk : ru;
  const day = (date: Date) => format(date, "d MMM", { locale });

  switch (payment.kind) {
    case "paid":
      return <p className="text-sm text-muted-foreground">{t("paymentPaid")}</p>;

    case "access_until":
      return (
        <p className="text-sm text-muted-foreground">
          {t("paymentAccessUntil", { date: day(payment.end) })}
        </p>
      );

    case "trial":
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("paymentTrialUntil", { date: day(payment.end) })}
          </p>
          {isSubscription && (
            <Button
              size="sm"
              onClick={onPay}
              className="rounded-full bg-[#FF6B00] text-white hover:bg-[#FF6B00]/90"
            >
              {t("paymentPayNow")}
            </Button>
          )}
        </div>
      );

    case "subscription": {
      const { urgency, end } = payment;
      const button =
        urgency === "far"
          ? {
              label: t("paymentPayAhead"),
              variant: "outline" as const,
              className: "hover:bg-[#FF6B00]/10 hover:text-[#FF6B00]",
            }
          : urgency === "soon"
            ? {
                label: t("paymentSoon"),
                variant: "default" as const,
                className: "bg-[#FF6B00]/10 text-[#FF6B00] hover:bg-[#FF6B00]/20",
              }
            : {
                label: t("paymentPayNow"),
                variant: "default" as const,
                className: "bg-[#FF6B00] text-white hover:bg-[#FF6B00]/90",
              };

      return (
        <div className="space-y-1.5">
          <Button
            size="sm"
            variant={button.variant}
            onClick={onPay}
            className={cn("rounded-full", button.className)}
          >
            {button.label}
          </Button>
          <p className="text-xs text-muted-foreground">
            {urgency === "expired"
              ? t("paymentEnded", { date: day(end) })
              : t("paymentUntil", { date: day(end) })}
          </p>
        </div>
      );
    }
  }
};

/** Loads the buyer's review state for one product and opens the rating dialog. */
const ReviewCell = ({ productId, productTitle }: { productId: string; productTitle: string }) => {
  const { t } = useLanguage();
  const { data } = useProductReviews(productId);
  const [open, setOpen] = useState(false);

  if (!data?.canReview) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const { myReview } = data;

  return (
    <>
      {myReview ? (
        <button
          type="button"
          aria-label={t("reviewsUpdate")}
          onClick={() => setOpen(true)}
          className="inline-flex rounded-full px-1 py-1 transition-colors hover:bg-muted focus-ring"
        >
          <Stars rating={myReview.rating} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-[#FF6B00]/10 px-4 py-1.5 text-sm font-medium text-[#FF6B00] hover:bg-[#FF6B00]/20 transition-colors"
        >
          {t("reviewsLeave")}
        </button>
      )}
      <ReviewProductDialog
        productId={productId}
        productTitle={productTitle}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
};

export default PurchasesList;
