/** Six low-saturation tints — no brand orange. */
const COVER_TINTS = [
  "#E6E8EB",
  "#E4E9E6",
  "#E7E5EA",
  "#E8E7E2",
  "#E3E7EA",
  "#E7E6E3",
] as const;

export function coverTintFromId(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return COVER_TINTS[(hash >>> 0) % COVER_TINTS.length];
}

export function formatOgPriceTenge(price: number): string {
  const amount = new Intl.NumberFormat("ru-KZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);
  return `${amount}\u00A0₸`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isCrawlerUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("whatsapp") ||
    ua.includes("telegram") ||
    ua.includes("facebookexternalhit") ||
    ua.includes("facebot") ||
    ua.includes("twitterbot") ||
    ua.includes("vkshare") ||
    ua.includes("slackbot") ||
    ua.includes("discordbot") ||
    ua.includes("googlebot")
  );
}

export function getSiteOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://dostup.vercel.app";
}

export function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

type PublicProductRow = {
  id: string;
  slug: string | null;
  title: string;
  headline: string | null;
  image_url: string | null;
  price: number;
  seller_handle: string | null;
  seller_display_name: string | null;
};

type ProductRow = {
  id: string;
  slug: string | null;
  title: string;
  headline: string | null;
  image_url: string | null;
  price: number;
  creator_account_id: string | null;
};

async function fetchFromView(
  view: string,
  column: "slug" | "id",
  value: string,
  headers: Record<string, string>,
  supabaseUrl: string,
): Promise<PublicProductRow | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/${view}?${column}=eq.${encodeURIComponent(value)}&select=id,slug,title,headline,image_url,price,seller_handle,seller_display_name&limit=1`,
    { headers },
  );
  const data = (await res.json()) as PublicProductRow[];
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function enrichProductRow(
  row: ProductRow,
  headers: Record<string, string>,
  supabaseUrl: string,
): Promise<PublicProductRow> {
  if (!row.creator_account_id) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      headline: row.headline,
      image_url: row.image_url,
      price: row.price,
      seller_handle: null,
      seller_display_name: null,
    };
  }

  const accountRes = await fetch(
    `${supabaseUrl}/rest/v1/creator_accounts?id=eq.${encodeURIComponent(row.creator_account_id)}&select=display_name,profiles(handle,display_name)&limit=1`,
    { headers },
  );
  const accounts = (await accountRes.json()) as Array<{
    display_name: string | null;
    profiles: { handle: string | null; display_name: string | null } | Array<{
      handle: string | null;
      display_name: string | null;
    }> | null;
  }>;

  const account = Array.isArray(accounts) ? accounts[0] : null;
  const profile = account
    ? (Array.isArray(account.profiles) ? account.profiles[0] : account.profiles)
    : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    headline: row.headline,
    image_url: row.image_url,
    price: row.price,
    seller_handle: profile?.handle ?? null,
    seller_display_name: profile?.display_name || account?.display_name || null,
  };
}

async function fetchProductRow(
  column: "slug" | "id",
  value: string,
  headers: Record<string, string>,
  supabaseUrl: string,
): Promise<ProductRow | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/products?${column}=eq.${encodeURIComponent(value)}&is_active=eq.true&select=id,slug,title,headline,image_url,price,creator_account_id&limit=1`,
    { headers },
  );
  const data = (await res.json()) as ProductRow[];
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export async function fetchPublicProduct(idOrSlug: string): Promise<PublicProductRow | null> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  const bySlug = await fetchFromView("public_products", "slug", idOrSlug, headers, url);
  if (bySlug) return bySlug;

  const byId = await fetchFromView("public_products", "id", idOrSlug, headers, url);
  if (byId) return byId;

  const productBySlug = await fetchProductRow("slug", idOrSlug, headers, url);
  if (productBySlug) return await enrichProductRow(productBySlug, headers, url);

  const productById = await fetchProductRow("id", idOrSlug, headers, url);
  if (productById) return await enrichProductRow(productById, headers, url);

  try {
    const res = await fetch(`${url}/functions/v1/catalog`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ action: "get_product", idOrSlug }),
    });
    if (res.ok) {
      const data = await res.json();
      const p = data?.product;
      if (p) {
        return {
          id: p.id,
          slug: p.slug,
          title: p.title || "Dostup",
          headline: p.headline || null,
          image_url: p.image_url || null,
          price: Number(p.price) || 0,
          seller_handle: p.seller_handle ?? null,
          seller_display_name: p.author_name ?? null,
        };
      }
    }
  } catch {
    // ignore fetch errors
  }

  return null;
}

export async function fetchProductSlugById(id: string): Promise<string | null> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  const res = await fetch(
    `${url}/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=slug&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );
  const data = (await res.json()) as Array<{ slug: string | null }>;
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0]?.slug ?? null;
}

export function absoluteAssetUrl(origin: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return new URL(path.startsWith("/") ? path : `/${path}`, origin).toString();
}

export function buildOgDescription(product: PublicProductRow): string {
  const parts: string[] = [];
  if (product.headline) parts.push(product.headline);
  parts.push(formatOgPriceTenge(product.price));
  const seller = product.seller_display_name || product.seller_handle;
  if (seller) parts.push(seller);
  return parts.join(" · ");
}

export function buildProductPageUrl(origin: string, product: PublicProductRow, search = ""): string {
  const slug = product.slug || product.id;
  const url = new URL(`/p/${encodeURIComponent(slug)}`, origin);
  if (search) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    params.forEach((value, key) => url.searchParams.set(key, value));
  }
  return url.toString();
}

export function buildOgImageUrl(origin: string, product: PublicProductRow): string {
  if (product.image_url) {
    return absoluteAssetUrl(origin, product.image_url);
  }
  return absoluteAssetUrl(origin, "/og-image.png");
}
