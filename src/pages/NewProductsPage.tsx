import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import CatalogGrid from "@/components/marketplace/CatalogGrid";
import CatalogSectionHeader from "@/components/marketplace/CatalogSectionHeader";
import BuyerAppShell from "@/components/layout/BuyerAppShell";
import BuyerMobileNav from "@/components/layout/BuyerMobileNav";
import PublicFooter from "@/components/layout/PublicFooter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useCatalogSearch } from "@/hooks/useCatalogSearch";
import { useHideScrollbar } from "@/hooks/useHideScrollbar";
import { cn } from "@/lib/utils";

interface NewProductsPageProps {
  sort?: "newest" | "rating";
}

const NewProductsPage = ({ sort: propSort }: NewProductsPageProps) => {
  const { t } = useLanguage();
  const location = useLocation();
  const { status, profileType, sessionToken } = useSimpleAuth();
  const signedIn = status === "authenticated" && Boolean(sessionToken && profileType);

  useHideScrollbar();

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const searchParams = new URLSearchParams(location.search);
  const querySort = searchParams.get("sort");

  const effectiveSort: "newest" | "rating" =
    propSort ??
    (querySort === "rating"
      ? "rating"
      : location.pathname === "/top-rated"
        ? "rating"
        : "newest");

  const isTopRated = effectiveSort === "rating";
  const search = useCatalogSearch(
    isTopRated ? { sort: "rating" } : { sort: "newest", onlyNew: true }
  );
  const products = search.data ?? [];

  const page = (
    <div className="flex min-h-screen flex-col bg-background no-scrollbar">
      <div
        className={cn(
          "sticky top-0 z-20 bg-background transition-colors",
          "pt-[env(safe-area-inset-top)]",
          isScrolled ? "border-b border-border" : "border-b border-transparent"
        )}
      >
        <div className="mx-auto w-full px-4 sm:px-6 py-4">
          <CatalogSectionHeader
            as="h1"
            title={
              isTopRated ? (
                <>
                  ⭐{" "}
                  <span className="md:hidden">{t("allTopRatedProductsTitleShort")}</span>
                  <span className="hidden md:inline">{t("allTopRatedProductsTitle")}</span>
                </>
              ) : (
                <>🆕 {t("allNewProductsTitle")}</>
              )
            }
            className="mb-0 items-center"
            titleClassName="text-[20px] md:text-[26px] font-bold tracking-tight text-[#1F2328] leading-snug"
            action={
              <Link
                to="/"
                onClick={(e) => {
                  if (window.history.state && window.history.state.idx > 0) {
                    e.preventDefault();
                    window.history.back();
                  }
                }}
                className="inline-flex shrink-0 items-center gap-2 public-meta hover:text-foreground focus-ring rounded-md"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t("back")}</span>
              </Link>
            }
          />
        </div>
      </div>

      <main className="flex flex-1 flex-col pb-0 pt-0 md:pb-16">
        <section className="w-full px-4 sm:px-6 pb-16 pt-4 sm:pt-6">
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
