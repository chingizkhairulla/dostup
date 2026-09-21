import type {
  ProductDraftFormData,
  ProductMediaItem,
} from "@/components/creator/CreatorProductsTab";
import type { CatalogCategory } from "@/lib/catalog";
import {
  buildCommonPayload,
  buildCreatePayload,
  buildMediaPayload,
  validateProductForm,
} from "@/lib/productPayload";

export type PersistDeps = {
  createProduct(payload: ReturnType<typeof buildCreatePayload>): Promise<{ id: string }>;
  updateProduct(payload: { id: string } & Record<string, unknown>): Promise<unknown>;
  /** Uploads one picked file for the product and returns its stored url; throws on failure. */
  uploadMedia(item: ProductMediaItem, productId: string): Promise<string>;
};

export type PersistInput = {
  form: ProductDraftFormData;
  categories: CatalogCategory[];
  /** The product being edited, or null when it has not been created yet. */
  productId: string | null;
};

export type PersistResult =
  | { status: "skipped" }
  | {
      status: "saved";
      productId: string;
      created: boolean;
      /** Picked files that were uploaded this time, keyed by media item id. */
      uploaded: Record<string, string>;
      failedMediaIds: string[];
    };

/** A file the seller picked that is still only a local preview, not yet stored. */
export function isStagedMedia(item: ProductMediaItem): boolean {
  return Boolean(item.file) && (item.url || "").startsWith("blob:");
}

/**
 * Saves a product from the form: creates it if it does not exist yet, uploads
 * any newly picked files, then writes the fields. Safe to call repeatedly with
 * the latest form; an incomplete form is skipped silently rather than reported,
 * because it runs while the seller is still typing.
 */
export async function persistProduct(
  input: PersistInput,
  deps: PersistDeps,
): Promise<PersistResult> {
  const { form, categories } = input;
  if (validateProductForm(form)) return { status: "skipped" };

  let productId = input.productId;
  let created = false;
  if (!productId) {
    const product = await deps.createProduct(buildCreatePayload(form, categories));
    productId = product.id;
    created = true;
  }

  const uploaded: Record<string, string> = {};
  const failedMediaIds: string[] = [];
  for (const item of form.media || []) {
    if (!isStagedMedia(item)) continue;
    try {
      uploaded[item.id] = await deps.uploadMedia(item, productId);
    } catch {
      failedMediaIds.push(item.id);
    }
  }

  // A local blob url is only meaningful in this browser tab, so it is never
  // written to the product, even if its upload failed.
  const persistable = (form.media || [])
    .map((m) => (uploaded[m.id] ? { ...m, url: uploaded[m.id] } : m))
    .filter((m) => m.url && !m.url.startsWith("blob:"));

  // A brand-new product with no media was already written in full by the create.
  if (!(created && persistable.length === 0)) {
    await deps.updateProduct({
      id: productId,
      ...buildCommonPayload(form, categories),
      ...buildMediaPayload(persistable),
    });
  }

  return { status: "saved", productId, created, uploaded, failedMediaIds };
}
