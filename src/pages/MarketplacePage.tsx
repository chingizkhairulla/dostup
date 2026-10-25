import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, Search } from "lucide-react";
import CatalogFilterRow from "@/components/marketplace/CatalogFilterRow";
import CategoryMenu from "@/components/marketplace/CategoryMenu";
import CatalogGrid from "@/components/marketplace/CatalogGrid";
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader";
import PublicContainer from "@/components/marketplace/PublicContainer";
import CatalogSectionHeader from "@/components/marketplace/CatalogSectionHeader";
import BuyerAppShell from "@/components/layout/BuyerAppShell";
import BuyerMobileNav from "@/components/layout/BuyerMobileNav";
import PublicFooter from "@/components/layout/PublicFooter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideScrollbar } from "@/hooks/useHideScrollbar";
import {
  useCatalogSearch,
  useCatalogTaxonomy,
  useAllProducts,
  useNewProducts,
  useTopRatedProducts,
  type CatalogSort,
} from "@/hooks/useCatalogSearch";
import { categoryLabel, visibleTaxonomy } from "@/lib/catalog";
import { profileHomePath } from "@/lib/creatorAuth";
import { cn } from "@/lib/utils";

/** Loads the next page of «Все продукты» once the end of the grid scrolls into view. */
const LoadMoreSentinel = ({ loading, onVisible }: { loading: boolean; onVisible: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisibleRef.current();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  return (
    <div ref={ref} className="flex justify-center py-8">
      {loading && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
    </div>
  );
};

const MarketplacePage = () => {
  const { t, language } = useLanguage();
  useHideScrollbar();
  const { status, profileType, sessionToken } = useSimpleAuth();
  const signedIn = status === "authenticated" && Boolean(sessionToken && profileType);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // The chosen category lives in the address, so «Смотреть все» and «Назад» come back to it.
  const [searchParams, setSearchParams] = useSearchParams();
  const categorySlug = searchParams.get("category") ?? "";
  const subcategorySlug = searchParams.get("subcategory") ?? "";
  const sort: CatalogSort = "newest";

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const taxonomy = useCatalogTaxonomy();
  const categories = visibleTaxonomy(taxonomy.data ?? []);

  // Without a search query the page shows the rails, narrowed to the chosen category if any.
  const showRails = !debouncedQuery;
  const scope = { categorySlug, subcategorySlug };

  const search = useCatalogSearch(
    {
      q: debouncedQuery,
      categorySlug,
      subcategorySlug,
      sort,
    },
    !showRails,
  );
  const isMobile = useIsMobile();
  const newProducts = useNewProducts(showRails, scope);
  const topRatedProducts = useTopRatedProducts(showRails, scope);
  const allProducts = useAllProducts(showRails, scope);
  // "Popular" and "Trending" rails (usePopularProducts / useTrendingProducts) come back once the
  // catalog is big enough for sales rankings to mean something — see docs/marketplace-roadmap.md.

  const visibleNewProducts = (newProducts.data ?? []).slice(0, isMobile ? 3 : 8);
  const visibleTopRatedProducts = (topRatedProducts.data ?? []).slice(0, isMobile ? 3 : 8);
  const allProductsList = allProducts.data?.pages.flat() ?? [];

  const products = search.data ?? [];
  const loading = showRails
    ? newProducts.isLoading || topRatedProducts.isLoading || allProducts.isLoading || taxonomy.isLoading
    : search.isLoading || taxonomy.isLoading;

  const setScope = (category: string, subcategory: string) => {
    const next = new URLSearchParams(searchParams);
    if (category) next.set("category", category);
    else next.delete("category");
    if (subcategory) next.set("subcategory", subcategory);
    else next.delete("subcategory");
    setSearchParams(next, { replace: true });
  };

  const selectCategory = (slug: string) => setScope(categorySlug === slug ? "" : slug, "");
  const selectFromMenu = (catSlug: string, subSlug: string) => setScope(catSlug, subSlug);

  // «Смотреть все» opens the full list for the same category.
  const scopedPath = (path: string) => {
    const params = new URLSearchParams();
    if (categorySlug) params.set("category", categorySlug);
    if (subcategorySlug) params.set("subcategory", subcategorySlug);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  const seeAllLink = (to: string, label: string) => (
    <Link
      to={scopedPath(to)}
      aria-label={label}
      className="inline-flex shrink-0 items-center justify-end min-h-[44px] min-w-[44px] rounded-md text-sm font-semibold text-primary transition-colors hover:text-[#E86000] focus-ring"
    >
      <span className="md:hidden">{t("seeAllMobile")}</span>
      <span className="hidden md:inline-flex md:items-center md:gap-1">
        {label}
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );

  const emptyCatalog = (
    <div className="rounded-2xl border border-border px-6 py-16 text-center">
      <p className="text-lg font-medium text-foreground">{t("catalogEmpty")}</p>
      <p className="public-meta mt-2">{t("catalogEmptyHint")}</p>
    </div>
  );

  // Sellers have their own home; checked after the hooks so they always run in the same order.
  if (signedIn && profileType !== "buyer") {
    return <Navigate to={profileHomePath(profileType)} replace />;
  }

  const page = (
    <div className="flex min-h-screen flex-col bg-background no-scrollbar">
      <MarketplaceHeader />
      <main className="flex flex-1 flex-col pb-0 pt-0 md:pb-16">
        <PublicContainer>
        <section className="text-center">
          <h1 className="hero-headline mx-auto pt-20 pb-14">
            {t("marketplaceHeadline")}
          </h1>

          <div className="relative mx-auto flex w-full max-w-[760px] items-center rounded-[10px] bg-[#F6F7F8]">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9AA0A6]"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchCatalogPlaceholder")}
              aria-label={t("searchCatalogPlaceholder")}
              className="h-[62px] min-w-0 flex-1 rounded-l-[10px] border-0 bg-transparent pl-[52px] pr-3 text-base text-[#1F2328] placeholder:text-[#9AA0A6] focus-ring"
              type="search"
              autoComplete="off"
            />
            <CategoryMenu categories={categories} onSelect={selectFromMenu} />
          </div>

          {categories.length >= 3 && (
            <div className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-4">
              {categories.map((category) => {
                const active = categorySlug === category.slug;
                return (
                  <button
                    key={category.slug}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectCategory(category.slug)}
                    className={cn(
                      "inline-flex h-11 items-center rounded-full border px-6 text-[15px] font-medium focus-ring",
                      active
                        ? "border-[#FF6B00]/30 bg-[#FF6B00]/10 text-[#1F2328]"
                        : "border-[#E3E5E8] bg-white text-[#1F2328] hover:border-[#D0D3D8]",
                    )}
                  >
                    {categoryLabel(category, language)}
                  </button>
                );
              })}
            </div>
          )}

          {categorySlug && (
            <CatalogFilterRow
              categories={categories}
              categorySlug={categorySlug}
              subcategorySlug={subcategorySlug}
              onSubcategoryChange={(slug) => setScope(categorySlug, slug)}
              className="mx-auto mt-5 max-w-4xl justify-center"
            />
          )}
        </section>
        </PublicContainer>

        {showRails ? (
          <section className="mt-[140px] w-full px-4 sm:px-6 pb-16 space-y-[64px] md:space-y-14">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {visibleNewProducts.length > 0 && (
                  <div>
                    <CatalogSectionHeader
                      title={<span className="whitespace-nowrap">🆕 {t("newProductsHeading")}</span>}
                      action={seeAllLink("/new", t("newProductsSeeAll"))}
                    />
                    <CatalogGrid products={visibleNewProducts} />
                  </div>
                )}

                {visibleTopRatedProducts.length > 0 && (
                  <div>
                    <CatalogSectionHeader
                      title={<span className="whitespace-nowrap">⭐ {t("topRatedHeading")}</span>}
                      action={seeAllLink("/top-rated", t("topRatedSeeAll"))}
                    />
                    <CatalogGrid products={visibleTopRatedProducts} />
                  </div>
                )}

                {allProductsList.length > 0 ? (
                  <div>
                    <CatalogSectionHeader title={t("allCatalogProducts")} />
                    <CatalogGrid products={allProductsList} />
                    {allProducts.hasNextPage && (
                      <LoadMoreSentinel
                        loading={allProducts.isFetchingNextPage}
                        onVisible={() => void allProducts.fetchNextPage()}
                      />
                    )}
                  </div>
                ) : (
                  emptyCatalog
                )}
              </>
            )}
          </section>
        ) : (
          <section className="mt-[140px] w-full px-6 pb-16">
            <h2 className="mb-6 text-[26px] font-bold tracking-tight text-[#1F2328]">
              {t("allCatalogProducts")}
            </h2>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : products.length === 0 ? (
              emptyCatalog
            ) : (
              <CatalogGrid products={products} />
            )}
          </section>
        )}
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
export default MarketplacePage;
