import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { kk, ru } from "date-fns/locale";
import ProductCover from "@/components/marketplace/ProductCover";
import ReviewProductDialog from "@/components/reviews/ReviewProductDialog";
import { Stars } from "@/components/reviews/ReviewItem";
import { useLanguage } from "@/contexts/LanguageContext";
import { useProductReviews } from "@/hooks/useProductReviews";
import { formatPriceTenge, productHref, type CatalogProduct } from "@/lib/catalog";
import type { PurchaseRowData } from "@/lib/purchasePayment";
import type { TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

// Desktop columns: product, price, access, date, payment, review. Header and rows share this
// template; every column but the product is centred under its title.
const DESKTOP_GRID =
  "md:grid md:grid-cols-[minmax(0,1fr)_repeat(5,max-content)] md:items-center md:gap-x-10";

const PERIOD_KEYS: Record<string, TranslationKey> = {
  month: "accessMonth",
  quarter: "accessQuarter",
  year: "accessYear",
};

const pillBase = "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-ring";

interface PurchasesListProps {
  rows: Array<{ data: PurchaseRowData; product: CatalogProduct }>;
}

const PurchasesList = ({ rows }: PurchasesListProps) => {
  const { t } = useLanguage();
  const titles: TranslationKey[] = [
    "purchasesColPrice",
    "purchasesColAccess",
    "purchasesColDate",
    "purchasesColPayment",
    "purchasesColReview",
  ];

  return (
    <div className="w-full min-w-0">
      <div
        className={cn(
          "hidden border-b border-border pb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground",
          DESKTOP_GRID,
        )}
      >
        <span>{t("purchasesColProduct")}</span>
        {titles.map((key) => (
          <span key={key} className="text-center">
            {t(key)}
          </span>
        ))}
      </div>

      {rows.map(({ data, product }) => (
        <PurchaseRow key={product.id} data={data} product={product} />
      ))}
    </div>
  );
};

const PurchaseRow = ({ data, product }: { data: PurchaseRowData; product: CatalogProduct }) => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const locale = language === "kk" ? kk : ru;
  const coverUrl = product.media?.find((m) => m.type === "image")?.url ?? product.image_url;
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

      {/* Phone: label/value pairs under the product. Desktop: `md:contents` puts the cells in the row grid. */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:mt-0 md:contents">
        <Cell label={t("purchasesColPrice")}>
          <p className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
            {formatPriceTenge(data.amount || product.price)}
          </p>
        </Cell>
        <Cell label={t("purchasesColAccess")}>
          <p className="whitespace-nowrap text-sm text-foreground">{accessLabel(data, t, (d) => format(d, "d MMM", { locale }))}</p>
        </Cell>
        <Cell label={t("purchasesColDate")}>
          <p className="whitespace-nowrap text-sm text-foreground">{format(data.purchasedAt, "d MMM yyyy", { locale })}</p>
        </Cell>
        <Cell label={t("purchasesColPayment")}>
          <PaymentCell
            data={data}
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
  <div className="flex min-w-0 flex-col items-start md:items-center md:text-center">
    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground md:hidden">{label}</p>
    {children}
  </div>
);

function accessLabel(
  data: PurchaseRowData,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  day: (date: Date) => string,
) {
  const { payment } = data;
  if (payment.kind === "subscription") {
    const key = data.billingPeriod ? PERIOD_KEYS[data.billingPeriod] : undefined;
    return key ? t(key) : "—";
  }
  if (payment.kind === "trial") return t("accessTrial");
  if (payment.kind === "access_until") return t("accessUntilDate", { date: day(payment.end) });
  return t("accessForever");
}

const PaymentCell = ({
  data,
  isSubscription,
  onPay,
}: {
  data: PurchaseRowData;
  isSubscription: boolean;
  onPay: () => void;
}) => {
  const { t } = useLanguage();
  const { payment } = data;

  if (payment.kind === "paid" || payment.kind === "access_until") {
    return <p className="text-sm text-muted-foreground">{t("paymentPaid")}</p>;
  }

  if (payment.kind === "trial") {
    if (!isSubscription) return <p className="text-sm text-muted-foreground">{t("paymentFree")}</p>;
    return (
      <button type="button" onClick={onPay} className={cn(pillBase, "bg-[#FF6B00] text-white hover:bg-[#E86000]")}>
        {t("paymentPayNow")}
      </button>
    );
  }

  // A subscription period can be paid at any time; the label says how close its end is.
  const styles = {
    far: { key: "paymentFar" as const, className: "border border-border text-foreground hover:bg-[#FF6B00]/10 hover:text-[#FF6B00]" },
    soon: { key: "paymentSoon" as const, className: "bg-[#FF6B00]/10 text-[#FF6B00] hover:bg-[#FF6B00]/20" },
    expired: { key: "paymentOverdue" as const, className: "bg-[#FF6B00] text-white hover:bg-[#E86000]" },
  }[payment.urgency];

  return (
    <button type="button" onClick={onPay} className={cn(pillBase, styles.className)}>
      {t(styles.key)}
    </button>
  );
};

/** Loads the buyer's review for one product and opens the review dialog. */
const ReviewCell = ({ productId, productTitle }: { productId: string; productTitle: string }) => {
  const { t } = useLanguage();
  const { data } = useProductReviews(productId);
  const [open, setOpen] = useState(false);

  if (!data?.canReview) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <>
      {data.myReview ? (
        <button
          type="button"
          aria-label={t("reviewsUpdate")}
          onClick={() => setOpen(true)}
          className="inline-flex rounded-full px-1 py-1 transition-colors hover:bg-muted focus-ring"
        >
          <Stars rating={data.myReview.rating} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(pillBase, "bg-[#FF6B00]/10 text-[#FF6B00] hover:bg-[#FF6B00]/20")}
        >
          {t("reviewsLeave")}
        </button>
      )}
      <ReviewProductDialog productId={productId} productTitle={productTitle} open={open} onOpenChange={setOpen} />
    </>
  );
};

export default PurchasesList;
