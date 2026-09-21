import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAXONOMY_DEFINITIONS } from "@/lib/taxonomyData";

// ---- The editor's collaborators, replaced so its own saving logic is what runs ------

// vi.mock factories are hoisted above everything, so what they use must be too.
const { createMutate, updateMutate, toastFn, productList } = vi.hoisted(() => ({
  productList: { current: [] as unknown[] },
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  toastFn: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useCreatorProducts: () => ({ data: productList.current, isLoading: false }),
  useCreateProduct: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateProduct: () => ({ mutateAsync: updateMutate, mutate: vi.fn(), isPending: false }),
  useDeleteProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const lessons = TAXONOMY_DEFINITIONS.find((d) => d.slug === "online-lessons")!;
const CATEGORY_ID = "cat-lessons";
const SUBCATEGORY_ID = "sub-individual";

vi.mock("@/hooks/useCatalogTaxonomy", () => ({
  useCatalogTaxonomy: () => ({
    data: [
      {
        id: CATEGORY_ID,
        slug: "online-lessons",
        name_ru: "Онлайн-уроки",
        name_kk: "Онлайн сабақтар",
        emoji: "📚",
        sort_order: 1,
        product_count: 0,
        subcategories: lessons.subcategories.map((s, i) => ({
          id: i === 0 ? SUBCATEGORY_ID : `sub-${s.slug}`,
          slug: s.slug,
          name_ru: s.name_ru,
          name_kk: s.name_kk,
        })),
      },
    ],
  }),
}));

// The form picks a category from the title on its own; make that deterministic.
vi.mock("@/lib/aiCategory", () => ({
  predictProductCategory: async () => ({
    categoryId: CATEGORY_ID,
    subcategoryId: SUBCATEGORY_ID,
    topic: "",
  }),
  isTopicMatch: () => false,
  isExactTopicMatch: () => false,
  suggestCustomTopicWithEmoji: async () => null,
}));

const uploadProductMedia = vi.fn();
vi.mock("@/lib/productMediaUpload", () => ({
  uploadProductMedia: (...args: unknown[]) => uploadProductMedia(...args),
  getVideoDuration: async () => 0,
  MAX_VIDEO_DURATION_SECONDS: 600,
}));
vi.mock("@/lib/videoCompressor", () => ({
  compressVideoIfNeeded: async (f: File) => f,
  COMPRESSION_THRESHOLD: Number.MAX_SAFE_INTEGER,
}));

vi.mock("@/components/ui/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: { value?: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="description" value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} />
  ),
  parseMarkdownToHtml: (v: string) => v,
}));
vi.mock("@/components/media/ProductVideoPlayer", () => ({
  default: () => null,
  videoBlobCache: new Map(),
}));
vi.mock("./ProductMaterialsManager", () => ({ default: () => null }));
vi.mock("@/components/share/ShareProductButton", () => ({ default: () => null }));
vi.mock("./CreatorPendingPayments", () => ({ default: () => null }));

vi.mock("@/contexts/SimpleAuthContext", () => ({ useSimpleAuth: () => ({ profiles: [] }) }));
vi.mock("@/lib/sessionApi", () => ({
  invokeApi: vi.fn().mockResolvedValue({}),
  creatorCreds: () => ({}),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/integrations/supabase/client", () => {
  const chain: object = new Proxy(() => chain, {
    get: (_t, prop) => (prop === "then" ? undefined : chain),
    apply: () => chain,
  });
  // Any call the tab makes (topics lookup, realtime channels, ...) gets a harmless answer.
  const supabase = new Proxy({}, { get: (_t, prop) => (prop === "auth" ? { getSession: async () => ({ data: {} }) } : () => chain) });
  return { supabase };
});

vi.mock("sonner", () => ({ toast: toastFn }));

import CreatorProductsTab from "@/components/creator/CreatorProductsTab";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CreatorProductsTab creatorName="Алдияр" />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

const PAY_LINK = "https://kaspi.kz/pay/test";

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Создать/ }));
  return screen.findByRole("dialog");
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(document.getElementById("title") as HTMLElement, "SAT Preparation");
  // The category is filled in by the form itself shortly after a title appears.
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  await user.click(screen.getByRole("button", { name: /^Оплата/ }));
  const linkInput = (await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>("input[id^='kaspi-link-']");
    if (!el) throw new Error("payment link input not shown yet");
    return el;
  })) as HTMLInputElement;
  await user.type(linkInput, PAY_LINK);
}

const settle = (ms = 1000) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  createMutate.mockReset();
  updateMutate.mockReset();
  uploadProductMedia.mockReset();
  createMutate.mockImplementation(async (payload: Record<string, unknown>) => ({ id: "new-product", slug: "sat", ...payload }));
  updateMutate.mockResolvedValue({});
  toastFn.mockClear();
  toastFn.warning.mockClear();
  toastFn.error.mockClear();
  productList.current = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("creating a product saves itself", () => {
  it("has no Create, Save or Cancel button at the bottom of the window", async () => {
    renderTab();
    const dialog = await openEditor(user);

    for (const label of [/Создать продукт/, /Сохранить/, /Отмена/, /Cancel/i]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
    expect(dialog).toBeInTheDocument();
  });

  it("creates nothing while the required fields are still missing", async () => {
    renderTab();
    await openEditor(user);

    await user.type(document.getElementById("title") as HTMLElement, "SAT Preparation");
    await settle(5000);

    expect(createMutate).not.toHaveBeenCalled();
  });

  it("creates a private product once the required fields are filled, without any click", async () => {
    renderTab();
    await openEditor(user);

    await fillRequired(user);
    await settle(1500);

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      title: "SAT Preparation",
      category_id: CATEGORY_ID,
      subcategory_id: SUBCATEGORY_ID,
      is_active: false,
    });
  });

  it("keeps updating that same product as the seller keeps typing, never creating a second", async () => {
    renderTab();
    await openEditor(user);
    await fillRequired(user);
    await settle(1500);
    expect(createMutate).toHaveBeenCalledTimes(1);

    await user.type(document.getElementById("title") as HTMLElement, " Course");
    await settle(1500);

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalled();
    expect(updateMutate.mock.calls.at(-1)![0]).toMatchObject({
      id: "new-product",
      title: "SAT Preparation Course",
    });
  });

  it("does not send is_active on later saves, so autosave cannot unpublish a product", async () => {
    renderTab();
    await openEditor(user);
    await fillRequired(user);
    await settle(1500);

    await user.type(document.getElementById("title") as HTMLElement, "!");
    await settle(1500);

    for (const [payload] of updateMutate.mock.calls) {
      expect(payload).not.toHaveProperty("is_active");
    }
  });

  it("does not create a second product when a change lands while the first is still being created", async () => {
    let finishCreate!: (v: unknown) => void;
    createMutate.mockImplementationOnce(
      () => new Promise((resolve) => { finishCreate = () => resolve({ id: "new-product", slug: "sat" }); }),
    );
    renderTab();
    await openEditor(user);
    await fillRequired(user);
    await settle(1200);
    expect(createMutate).toHaveBeenCalledTimes(1);

    await user.type(document.getElementById("title") as HTMLElement, " X");
    await settle(2000);
    expect(createMutate).toHaveBeenCalledTimes(1);

    await act(async () => { finishCreate(null); });
    await settle(2000);

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls.at(-1)![0]).toMatchObject({ id: "new-product", title: "SAT Preparation X" });
  });
});

describe("closing the window", () => {
  // A click outside the window, or Escape, closes it: this is the only way to close on a computer.
  it("saves what was typed a moment ago, without waiting for the pause", async () => {
    renderTab();
    await openEditor(user);
    await fillRequired(user);
    await settle(1500);
    updateMutate.mockClear();

    await user.type(document.getElementById("title") as HTMLElement, " late");
    await user.keyboard("{Escape}");
    await settle(100);

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ title: "SAT Preparation late" });
  });

  it("closes on a click outside the window", async () => {
    renderTab();
    await openEditor(user);

    const overlay = document.querySelector("[data-state='open'].fixed.inset-0") as HTMLElement;
    await user.click(overlay);
    await settle(100);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  // Closing on half-filled work must not throw it away without a word.
  it("warns why nothing was saved when the fields could not be saved yet", async () => {
    renderTab();
    await openEditor(user);
    await user.type(document.getElementById("title") as HTMLElement, "SAT Preparation");
    await user.keyboard("{Escape}");
    await settle(100);

    expect(createMutate).not.toHaveBeenCalled();
    expect(toastFn.warning).toHaveBeenCalledTimes(1);
  });

  it("closes silently when nothing was typed", async () => {
    renderTab();
    await openEditor(user);

    await user.keyboard("{Escape}");
    await settle(100);

    expect(toastFn.warning).not.toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("starts the next new product from a blank form", async () => {
    renderTab();
    await openEditor(user);
    await fillRequired(user);
    await settle(1500);
    await user.keyboard("{Escape}");
    await settle(300);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openEditor(user);

    expect((document.getElementById("title") as HTMLInputElement).value).toBe("");
  });
});


// ---- Editing a product that already exists --------------------------------------------

const existing = {
  id: "p1",
  slug: "sat",
  title: "Existing course",
  headline: "",
  description: "",
  price: 10000,
  kaspi_link: PAY_LINK,
  telegram_link: null,
  has_schedule: false,
  is_active: true,
  is_paused: false,
  image_url: null,
  video_url: null,
  media: [],
  faq: [],
  kaspi_phone: null,
  access_duration_days: null,
  payment_type: "one_time",
  category_id: CATEGORY_ID,
  subcategory_id: SUBCATEGORY_ID,
  pricing_options: [
    {
      id: "opt-1",
      payment_type: "one_time",
      price: 10000,
      has_free_trial: false,
      kaspi_link: PAY_LINK,
    },
  ],
};

async function openExisting(user: ReturnType<typeof userEvent.setup>) {
  productList.current = [existing];
  renderTab();
  await user.click(screen.getByRole("button", { name: /Редактировать/ }));
  const dialog = await screen.findByRole("dialog");
  // The details section starts collapsed when editing.
  await user.click(screen.getByRole("button", { name: /^Детали/ }));
  await screen.findByDisplayValue("Existing course");
  return dialog;
}

describe("editing an existing product saves itself", () => {
  it("has no Save or Cancel button either", async () => {
    await openExisting(user);

    for (const label of [/Сохранить/, /Отмена/, /Cancel/i]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });

  // Opening a window must not write anything: the data is exactly what is stored.
  it("saves nothing just because the window was opened", async () => {
    await openExisting(user);
    await settle(5000);

    expect(updateMutate).not.toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("writes a change to that same product and never creates another", async () => {
    await openExisting(user);

    await user.type(document.getElementById("title") as HTMLElement, " v2");
    await settle(1500);

    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "p1", title: "Existing course v2" });
  });

  it("does not touch whether the product is published", async () => {
    await openExisting(user);

    await user.type(document.getElementById("title") as HTMLElement, "!");
    await settle(1500);

    expect(updateMutate.mock.calls[0][0]).not.toHaveProperty("is_active");
    expect(updateMutate.mock.calls[0][0]).not.toHaveProperty("is_paused");
  });

  it("saves a last-second change when the window is closed", async () => {
    await openExisting(user);

    await user.type(document.getElementById("title") as HTMLElement, "!");
    await user.keyboard("{Escape}");
    await settle(100);

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "p1", title: "Existing course!" });
  });

  it("does not carry one product's text into the next window", async () => {
    await openExisting(user);
    await user.type(document.getElementById("title") as HTMLElement, "!");
    await user.keyboard("{Escape}");
    await settle(300);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Создать/ }));
    await screen.findByRole("dialog");

    expect((document.getElementById("title") as HTMLInputElement).value).toBe("");
  });
});
