import {
  buildOgDescription,
  buildOgImageUrl,
  buildProductPageUrl,
  escapeHtml,
  fetchPublicProduct,
  getSiteOrigin,
} from "./_lib/og.js";

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const origin = getSiteOrigin(request);

  if (!slug) {
    return new Response("Missing product", { status: 400 });
  }

  const product = await fetchPublicProduct(slug);
  const pageUrl = product
    ? buildProductPageUrl(origin, product, url.searchParams.get("search") || "")
    : new URL(`/p/${encodeURIComponent(slug)}`, origin).toString();

  const title = escapeHtml(product?.title || "Dostup");
  const description = escapeHtml(
    product ? buildOgDescription(product) : "Платформа для проведения уроков и продажи курсов!",
  );
  const image = escapeHtml(
    product ? buildOgImageUrl(origin, product) : new URL("/og-image.png", origin).toString(),
  );
  const canonical = escapeHtml(pageUrl);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta property="og:type" content="product"/>
<meta property="og:site_name" content="Dostup"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:image" content="${image}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="${canonical}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${description}"/>
<meta name="twitter:image" content="${image}"/>
<title>${title}</title>
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
