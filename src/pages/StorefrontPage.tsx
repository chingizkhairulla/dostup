import { Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import CatalogGrid from "@/components/marketplace/CatalogGrid";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import PublicContainer from "@/components/marketplace/PublicContainer";
import PublicFooter from "@/components/layout/PublicFooter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSellerStorefront } from "@/hooks/useSellerStorefront";
import ShareProductButton from "@/components/share/ShareProductButton";
import StorefrontChatButton from "@/components/share/StorefrontChatButton";
import { sellerInitial } from "@/lib/productCover";

const StorefrontPage = () => {
  const { handle } = useParams();
  const { t } = useLanguage();
  const { data: seller, isLoading } = useSellerStorefront(handle);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketplaceHeader />
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
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h1 className="min-w-0 text-2xl font-bold tracking-tight text-foreground">
                    {seller.display_name || seller.handle}
                  </h1>
                  <div className="flex shrink-0 items-center gap-2">
                    <ShareProductButton
                      title={seller.display_name || seller.handle}
                      id={seller.handle}
                      url={typeof window !== "undefined" ? `${window.location.origin}/s/${encodeURIComponent(seller.handle)}` : undefined}
                    />
                    <StorefrontChatButton sellerHandle={seller.handle} />
                  </div>
                </div>
                <p className="public-meta">
                  {seller.type === "school" ? t("sellerRoleSchool") : t("sellerRoleCreator")}
                </p>
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
