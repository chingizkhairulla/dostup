import { Loader2, Star } from "lucide-react";
import { useParams } from "react-router-dom";
import CatalogGrid from "@/components/marketplace/CatalogGrid";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import BackButton from "@/components/marketplace/BackButton";
import PublicContainer from "@/components/marketplace/PublicContainer";
import PublicFooter from "@/components/layout/PublicFooter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSellerStorefront } from "@/hooks/useSellerStorefront";
import { sellerInitial } from "@/lib/productCover";
import { sellerReviewsLabel, sellerSalesLabel } from "@/lib/catalog";

/** Five stars, filled to the nearest whole star; all empty when there is no rating. */
const StarRow = ({ rating }: { rating: number }) => {
  const filled = Math.round(Math.min(Math.max(rating, 0), 5));
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          data-filled={i < filled || undefined}
          className={i < filled ? "h-4 w-4 fill-[#FFB020] text-[#FFB020]" : "h-4 w-4 text-[#D1D5DB]"}
        />
      ))}
    </span>
  );
};

const StorefrontPage = () => {
  const { handle } = useParams();
  const { t, language } = useLanguage();
  const { data: seller, isLoading } = useSellerStorefront(handle);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketplaceHeader below={<BackButton />} />
      <PublicContainer as="main" className="flex-1 pb-16 pt-8">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !seller ? (
          <p className="py-16 public-body text-[#6B7280]">{t("storefrontNotFound")}</p>
        ) : (
          <>
            <section className="flex items-start gap-5">
              <Avatar className="h-20 w-20">
                {seller.avatar_url && (
                  <AvatarImage src={seller.avatar_url} alt={seller.display_name || seller.handle} />
                )}
                <AvatarFallback className="text-2xl">
                  {sellerInitial(seller.display_name || seller.handle)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {seller.display_name || seller.handle}
                </h1>
                <p className="public-meta">
                  {seller.type === "school" ? t("sellerRoleSchool") : t("sellerRoleCreator")}
                </p>
                {seller.created_at && (
                  <p className="public-meta">
                    {t("sellerJoinedYear", { year: new Date(seller.created_at).getFullYear() })}
                  </p>
                )}
                {/* Both are always shown, even at zero: the customer wants every
                    seller's page to carry the same facts. The rating averages
                    every review of every product the seller owns. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span data-testid="seller-rating" className="flex items-center gap-1.5 text-sm text-[#6B7280]">
                    <span>{t("sellerOverallRating")}</span>
                    <StarRow rating={seller.review_count > 0 ? seller.avg_rating : 0} />
                    {seller.review_count > 0 ? (
                      <>
                        <span className="font-medium text-foreground">
                          {seller.avg_rating.toFixed(1)}
                        </span>
                        <span>· {sellerReviewsLabel(seller.review_count, language)}</span>
                      </>
                    ) : (
                      <span>· {t("sellerNoReviews")}</span>
                    )}
                  </span>
                  <span className="text-sm text-[#6B7280]">
                    {sellerSalesLabel(seller.sales_count, language)}
                  </span>
                </div>
                {seller.bio && (
                  <p className="public-body max-w-2xl whitespace-pre-wrap text-[#6B7280]">
                    {seller.bio}
                  </p>
                )}
              </div>
            </section>
            <section className="mt-10 w-full">
              <div className="mb-6">
                <h2 className="text-[26px] font-bold tracking-tight text-[#1F2328]">
                  {t("allCatalogProducts")}
                </h2>
              </div>
              {seller.products.length === 0 ? (
                <p className="py-10 public-body text-[#6B7280]">{t("catalogEmpty")}</p>
              ) : (
                <CatalogGrid products={seller.products} />
              )}
            </section>
          </>
        )}
      </PublicContainer>
      <PublicFooter />
    </div>
  );
};

export default StorefrontPage;
