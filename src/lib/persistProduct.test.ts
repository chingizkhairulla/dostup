import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProductDraftFormData,
  ProductMediaItem,
} from "@/components/creator/CreatorProductsTab";
import type { CatalogCategory } from "@/lib/catalog";
import { isStagedMedia, persistProduct, type PersistDeps } from "@/lib/persistProduct";

function form(overrides: Partial<ProductDraftFormData> = {}): ProductDraftFormData {
  return {
    categoryId: "cat-1",
    subcategoryId: "sub-1",
    topic: "",
    lessonFormat: "",
    eventStartsAt: "",
    capacity: "",
    billingPeriod: "",
    title: "SAT Preparation",
    headline: "",
    description: "",
    price: "10000",
    kaspiLink: "",
    telegramLink: "",
    imageUrl: "",
    videoUrl: "",
    media: [],
    faq: [],
    isPaid: true,
    kaspiMethod: "link",
    kaspiPhone: "",
    paymentType: "one_time",
    recurringInterval: "1m",
    recurringCustomDays: 30,
    hasFreeTrial: false,
    trialPreset: "7",
    trialCustomDays: 7,
    pricingOptions: [
      {
        id: "opt-1",
        paymentType: "one_time",
        price: "10000",
        recurringInterval: "1m",
        recurringCustomDays: 30,
        hasFreeTrial: false,
        trialPreset: "7",
        trialCustomDays: 7,
        kaspiMethod: "link",
        kaspiLink: "https://kaspi.kz/pay/x",
        kaspiPhone: "",
      },
    ],
    ...overrides,
  };
}

const categories = [
  { id: "cat-1", slug: "online-lessons", subcategories: [{ id: "sub-1", slug: "group" }] },
] as unknown as CatalogCategory[];

const staged = (id: string, overrides: Partial<ProductMediaItem> = {}): ProductMediaItem => ({
  id,
  type: "image",
  url: `blob:local-${id}`,
  previewUrl: `blob:local-${id}`,
  file: new File(["x"], `${id}.jpg`),
  ...overrides,
});

const stored = (id: string, overrides: Partial<ProductMediaItem> = {}): ProductMediaItem => ({
  id,
  type: "image",
  url: `https://cdn/${id}.jpg`,
  ...overrides,
});

let calls: string[];
let deps: PersistDeps;

beforeEach(() => {
  calls = [];
  deps = {
    createProduct: vi.fn(async () => {
      calls.push("create");
      return { id: "new-id" };
    }),
    updateProduct: vi.fn(async () => {
      calls.push("update");
      return {};
    }),
    uploadMedia: vi.fn(async (item: ProductMediaItem) => {
      calls.push(`upload:${item.id}`);
      return `https://cdn/${item.id}.jpg`;
    }),
  };
});

const run = (f: ProductDraftFormData, productId: string | null = null) =>
  persistProduct({ form: f, categories, productId }, deps);

describe("persistProduct: incomplete forms", () => {
  it("does nothing, and says nothing, while the form is still incomplete", async () => {
    const result = await run(form({ title: "" }));

    expect(result).toEqual({ status: "skipped" });
    expect(deps.createProduct).not.toHaveBeenCalled();
    expect(deps.updateProduct).not.toHaveBeenCalled();
    expect(deps.uploadMedia).not.toHaveBeenCalled();
  });

  it("does not create a product before a category is chosen", async () => {
    await run(form({ categoryId: "" }));
    expect(deps.createProduct).not.toHaveBeenCalled();
  });

  // Without a way to pay, a paid product could never be bought once published.
  it("does not create a paid product that has no way to pay", async () => {
    const noLink = form();
    noLink.pricingOptions = [{ ...noLink.pricingOptions[0], kaspiLink: "" }];

    expect(await run(noLink)).toEqual({ status: "skipped" });
    expect(deps.createProduct).not.toHaveBeenCalled();
  });
});

describe("persistProduct: first save creates the product", () => {
  it("creates it once, private, and writes nothing more when there is no media", async () => {
    const result = await run(form());

    expect(deps.createProduct).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.createProduct).mock.calls[0][0]).toMatchObject({
      title: "SAT Preparation",
      is_active: false,
    });
    expect(deps.updateProduct).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "saved", productId: "new-id", created: true });
  });

  it("uploads picked files and then updates the product with their stored urls", async () => {
    const result = await run(form({ media: [staged("m1")] }));

    expect(calls).toEqual(["create", "upload:m1", "update"]);
    expect(vi.mocked(deps.updateProduct).mock.calls[0][0]).toMatchObject({
      id: "new-id",
      image_url: "https://cdn/m1.jpg",
      media: [{ type: "image", url: "https://cdn/m1.jpg" }],
    });
    expect(result).toMatchObject({ uploaded: { m1: "https://cdn/m1.jpg" } });
  });

  it("propagates a failed create and does nothing after it", async () => {
    vi.mocked(deps.createProduct).mockRejectedValueOnce(new Error("boom"));

    await expect(run(form({ media: [staged("m1")] }))).rejects.toThrow("boom");
    expect(deps.uploadMedia).not.toHaveBeenCalled();
    expect(deps.updateProduct).not.toHaveBeenCalled();
  });
});

describe("persistProduct: later saves update the same product", () => {
  it("never creates a second product", async () => {
    const result = await run(form(), "existing-id");

    expect(deps.createProduct).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "saved", productId: "existing-id", created: false });
  });

  it("writes the fields to that product", async () => {
    await run(form({ title: "Renamed" }), "existing-id");

    expect(vi.mocked(deps.updateProduct).mock.calls[0][0]).toMatchObject({
      id: "existing-id",
      title: "Renamed",
    });
  });

  it("does not send create-only fields, so an update cannot unpublish a live product", async () => {
    await run(form(), "existing-id");

    const sent = vi.mocked(deps.updateProduct).mock.calls[0][0];
    expect(sent).not.toHaveProperty("is_active");
    expect(sent).not.toHaveProperty("has_schedule");
  });

  it("does not re-upload files that are already stored", async () => {
    await run(form({ media: [stored("s1"), stored("s2", { file: new File(["x"], "s2.jpg") })] }), "existing-id");

    expect(deps.uploadMedia).not.toHaveBeenCalled();
    expect(vi.mocked(deps.updateProduct).mock.calls[0][0]).toMatchObject({
      media: [{ url: "https://cdn/s1.jpg" }, { url: "https://cdn/s2.jpg" }],
    });
  });

  it("clears the media when the seller removed all of it", async () => {
    await run(form({ media: [] }), "existing-id");

    expect(vi.mocked(deps.updateProduct).mock.calls[0][0]).toMatchObject({
      image_url: null,
      video_url: null,
      media: [],
    });
  });

  it("propagates a failed update", async () => {
    vi.mocked(deps.updateProduct).mockRejectedValueOnce(new Error("nope"));
    await expect(run(form(), "existing-id")).rejects.toThrow("nope");
  });
});

// A blob: url only exists inside one browser tab. Persisting one would leave the
// product with a permanently broken image.
describe("persistProduct: local preview urls never reach the product", () => {
  it("leaves a picked file out when its upload fails, and reports it", async () => {
    vi.mocked(deps.uploadMedia).mockRejectedValueOnce(new Error("upload failed"));

    const result = await run(form({ media: [staged("bad"), stored("good")] }), "existing-id");

    const sent = vi.mocked(deps.updateProduct).mock.calls[0][0] as unknown as { media: { url: string }[] };
    expect(sent.media).toEqual([{ type: "image", url: "https://cdn/good.jpg", objectPosition: undefined }]);
    expect(JSON.stringify(sent)).not.toContain("blob:");
    expect(result).toMatchObject({ status: "saved", failedMediaIds: ["bad"] });
  });

  it("does not throw because one file failed; the rest still saves", async () => {
    vi.mocked(deps.uploadMedia).mockRejectedValueOnce(new Error("upload failed"));

    await expect(run(form({ media: [staged("a"), staged("b")] }), "existing-id")).resolves.toMatchObject({
      status: "saved",
    });
    expect(deps.updateProduct).toHaveBeenCalledTimes(1);
  });

  it("drops a blob url that has no file behind it", async () => {
    await run(form({ media: [stored("orphan", { url: "blob:orphan" })] }), "existing-id");

    const sent = vi.mocked(deps.updateProduct).mock.calls[0][0] as unknown as { media: unknown[] };
    expect(sent.media).toEqual([]);
  });

  it("still updates a brand-new product when only a failed upload is left, without persisting it", async () => {
    vi.mocked(deps.uploadMedia).mockRejectedValueOnce(new Error("upload failed"));

    const result = await run(form({ media: [staged("bad")] }));

    expect(calls).toEqual(["create"]);
    expect(deps.updateProduct).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: true, failedMediaIds: ["bad"] });
  });
});

describe("isStagedMedia", () => {
  it("is true only for a picked file that is still a local preview", () => {
    expect(isStagedMedia(staged("a"))).toBe(true);
    expect(isStagedMedia(stored("b"))).toBe(false);
    expect(isStagedMedia(stored("c", { file: new File(["x"], "c.jpg") }))).toBe(false);
    expect(isStagedMedia(stored("d", { url: "blob:d" }))).toBe(false);
  });
});
