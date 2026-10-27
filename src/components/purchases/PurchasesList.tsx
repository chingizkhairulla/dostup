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
import type { AccessTerm, PurchaseRowData } from "@/lib/purchasePayment";
import type { TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

// Desktop: one grid for the whole table. The header and every row span all six columns and
// reuse them through subgrid, so a column is as wide as its widest value in any row and every
// value sits right under its own title.
const TABLE_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_repeat(5,max-content)] md:gap-x-12";
const ROW_GRID = "md:col-span-6 md:grid md:grid-cols-subgrid md:items-center";

const PERIOD_KEYS: Record<string, TranslationKey> = {
  "1m": "accessMonth",
  "3m": "accessQuarter",
  "1y": "accessYear",
};

/** White by default, light orange on hover, whatever the label says. */
const pillButton =
  "whitespace-nowrap rounded-full border border-[#E3E5E8] bg-white px-4 py-1.5 text-sm font-medium text-[#1F2328] transition-colors hover:border-[#FF6B00]/30 hover:bg-[#FF6B00]/10 hover:text-[#FF6B00] focus-ring";

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
    <div className={cn("w-full min-w-0", TABLE_GRID)}>
      <div
        className={cn(
          "hidden border-b border-border pb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground",
          ROW_GRID,
        )}
      >
        <span>{t("purchasesColProduct")}</span>
        {/* Titles stand in the middle of their column; the values under them start at its left edge. */}
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
    <div className={cn("border-b border-border py-4", ROW_GRID)}>
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
          <p className="whitespace-nowrap text-sm text-foreground">
            {accessLabel(data.access, t, (d) => format(d, "d MMM", { locale }))}
          </p>
        </Cell>
        <Cell label={t("purchasesColDate")}>
          <p className="whitespace-nowrap text-sm text-foreground">
            {format(data.purchasedAt, "d MMM yyyy", { locale })}
          </p>
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
  <div className="flex min-w-0 flex-col items-start">
    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground md:hidden">{label}</p>
    {children}
  </div>
);

function accessLabel(
  access: AccessTerm,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  day: (date: Date) => string,
) {
  switch (access.kind) {
    case "period": {
      const key = PERIOD_KEYS[access.interval];
      return key ? t(key) : t("accessDaysShort", { days: access.days });
    }
    case "until":
      return t("accessUntilDate", { date: day(access.end) });
    case "trial":
      return t("accessTrial");
    default:
      return t("accessForever");
  }
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

  if (payment.kind === "paid") {
    return <p className="whitespace-nowrap text-sm text-muted-foreground">{t("paymentPaid")}</p>;
  }

  if (payment.kind === "trial") {
    if (!isSubscription) return <p className="whitespace-nowrap text-sm text-muted-foreground">{t("paymentFree")}</p>;
    return (
      <button type="button" onClick={onPay} className={pillButton}>
        {t("paymentPayNow")}
      </button>
    );
  }

  // The next period can be paid at any time; the label says how close the end is.
  const key = { far: "paymentFar", soon: "paymentSoon", expired: "paymentOverdue" }[payment.urgency] as TranslationKey;
  return (
    <button type="button" onClick={onPay} className={pillButton}>
      {t(key)}
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
          className="inline-flex rounded-full px-1 py-1 transition-colors hover:bg-[#FF6B00]/10 focus-ring"
        >
          <Stars rating={data.myReview.rating} />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={pillButton}>
          {t("reviewsLeave")}
        </button>
      )}
      <ReviewProductDialog productId={productId} productTitle={productTitle} open={open} onOpenChange={setOpen} />
    </>
  );
};

export default PurchasesList;
