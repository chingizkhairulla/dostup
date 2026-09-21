export type ProductTitleSize = "default" | "long" | "xlong";

// Character counts at which the display size steps down. Measured against the
// full-width title row: ~24 characters is roughly one line at the largest
// desktop size, and ~48 is where two lines stop being enough.
const LONG_AFTER = 24;
const XLONG_AFTER = 48;

export const PRODUCT_TITLE_CLASS: Record<ProductTitleSize, string> = {
  default: "public-display",
  long: "public-display-long",
  xlong: "public-display-xlong",
};

/**
 * Picks a display size for a product title from its length, so a long title
 * stays compact instead of stacking into many lines at the largest size.
 * `**bold**` markers are stripped first because the page renders them as
 * formatting, not text.
 */
export function productTitleSize(title: string | null | undefined): ProductTitleSize {
  const length = (title ?? "").replace(/\*\*/g, "").trim().length;
  if (length > XLONG_AFTER) return "xlong";
  if (length > LONG_AFTER) return "long";
  return "default";
}
