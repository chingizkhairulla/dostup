import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import CatalogGrid from "@/components/marketplace/CatalogGrid";
import CatalogSectionHeader from "@/components/marketplace/CatalogSectionHeader";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import BuyerAppShell from "@/components/layout/BuyerAppShell";
import BuyerMobileNav from "@/components/layout/BuyerMobileNav";
import PublicFooter from "@/components/layout/PublicFooter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useCatalogSearch } from "@/hooks/useCatalogSearch";

const NewProductsPage = () => {
  const { t } = useLanguage();
  const { status, profileType, sessionToken } = useSimpleAuth();
  const signedIn = status === "authenticated" && Boolean(sessionToken && profileType);

  const search = useCatalogSearch({ sort: "newest", onlyNew: true });
  const products = search.data ?? [];

  const page = (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketplaceHeader />
      <main className="flex flex-1 flex-col pb-0 pt-0 md:pb-16">
        <section className="w-full px-6 pb-16 pt-10">
          <CatalogSectionHeader
            as="h1"
            title={<>🆕 {t("newProductsHeading")}</>}
            action={
              <Link
                to="/"
                className="inline-flex shrink-0 items-center gap-2 public-meta hover:text-foreground focus-ring rounded-md"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t("back")}</span>
              </Link>
            }
          />

          {search.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-border px-6 py-16 text-center">
              <p className="text-lg font-medium text-foreground">{t("catalogEmpty")}</p>
              <p className="public-meta mt-2">{t("catalogEmptyHint")}</p>
            </div>
          ) : (
            <CatalogGrid products={products} />
          )}
        </section>
      </main>

      <PublicFooter />
    </div>
  );

  if (signedIn) {
    return (
      <BuyerAppShell
        activeSection="search"
        mobileNav={
          profileType === "buyer" ? (
            <BuyerMobileNav activeTab="search" />
          ) : undefined
        }
      >
        <div className="pb-20 md:pb-0">{page}</div>
      </BuyerAppShell>
    );
  }

  return page;
};

export default NewProductsPage;
