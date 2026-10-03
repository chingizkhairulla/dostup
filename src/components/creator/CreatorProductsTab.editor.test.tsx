import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => true,
}));

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

// jsdom has no canvas or image decoding, so the cropper's maths is replaced by a
// stand-in with the same surface. What is under test is the windows around it.
vi.mock("@/hooks/useCoverCrop", async () => {
  const { useState } = await import("react");
  return {
    COVER_FRAME_WIDTH: 384,
    COVER_FRAME_HEIGHT: 240,
    useCoverCrop: () => {
      const [source, setSource] = useState<string | null>(null);
      const [file, setFile] = useState<File | null>(null);
      return {
        source,
        mediaType: "image",
        previewStyle: {},
        zoom: 1,
        setZoom: () => undefined,
        onPointerDown: () => undefined,
        onPointerMove: () => undefined,
        onPointerUp: () => undefined,
        loadFile: (f: File) => { setFile(f); setSource(`blob:${f.name}`); },
        resetCrop: () => { setSource(null); setFile(null); },
        cropResult: async () => ({ file, type: "image", previewUrl: `blob:cropped-${file?.name}`, objectPosition: "center" }),
      };
    },
  };
});

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
  await user.click(screen.getByRole("button", { name: /^Создать$/ }));
  const dialog = await screen.findByRole("dialog");
  // Round 3: Details start open for a new product. Opened here only if not.
  if (!screen.queryByLabelText("description")) {
    await user.click(screen.getByRole("button", { name: /^Детали/ }));
  }
  await screen.findByLabelText("description");
  return dialog;
}

const editor = () => screen.getAllByRole("dialog")[0];
const submitButton = (name: RegExp) => within(editor()).getByRole("button", { name });
const closeButton = () => within(editor()).getByRole("button", { name: "Закрыть" });
const typeTitle = (text: string) => user.type(document.getElementById("title") as HTMLElement, text);

async function pickCover(name = "cover.png") {
  const input = document.querySelector<HTMLInputElement>("input[type='file'][accept*='image']");
  if (!input) throw new Error("no media input");
  fireEvent.change(input, { target: { files: [new File(["x"], name, { type: "image/png" })] } });
  return screen.findByRole("dialog", { name: "Настройка обложки" });
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
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name ?? "file"}`);
  URL.revokeObjectURL = vi.fn();
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
  // The details section still starts collapsed when editing.
  await user.click(screen.getByRole("button", { name: /^Детали/ }));
  await screen.findByDisplayValue("Existing course");
  return dialog;
}

// ---- Round 3: the cover-crop window opens on top of the editor ------------------------
// Customer report: adding a photo closed the product window in the background,
// and a click outside the crop window then dropped the seller back on the
// product list with nothing saved.
describe("the cover-crop window", () => {
  it("opens on top of the editor, which stays open behind it", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT Preparation");

    const crop = await pickCover();

    expect(crop).toBeInTheDocument();
    // Still mounted underneath. Radix hides it from assistive tech while the
    // crop window is on top, which also blanks its accessible name.
    const [underneath] = Array.from(document.querySelectorAll("[role=dialog]"));
    expect(underneath).not.toBe(crop);
    expect(underneath).toHaveTextContent("Создание продукта");
    expect(document.getElementById("title")).toHaveValue("SAT Preparation");
  });

  it("returns to the editor, with everything typed, on a click outside the crop window", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT Preparation");
    await pickCover();

    const overlays = document.querySelectorAll<HTMLElement>("[data-state='open'].fixed.inset-0");
    fireEvent.pointerDown(overlays[overlays.length - 1]);
    await settle(100);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Настройка обложки" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Создание продукта" })).toBeInTheDocument();
    expect(document.getElementById("title")).toHaveValue("SAT Preparation");
  });

  it("returns to the editor on Escape, without closing the editor too", async () => {
    renderTab();
    await openEditor(user);
    await pickCover();

    await user.keyboard("{Escape}");
    await settle(100);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Настройка обложки" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Создание продукта" })).toBeInTheDocument();
  });

  it("has a Save button and no Cancel or close cross", async () => {
    renderTab();
    await openEditor(user);
    const crop = await pickCover();

    expect(within(crop).getByRole("button", { name: /Сохранить/ })).toBeInTheDocument();
    expect(within(crop).queryByRole("button", { name: /Отмена/ })).not.toBeInTheDocument();
    expect(within(crop).queryByRole("button", { name: /Close|Закрыть/ })).not.toBeInTheDocument();
  });

  it("adds the photo and returns to the editor on Save", async () => {
    renderTab();
    await openEditor(user);
    const crop = await pickCover();

    await user.click(within(crop).getByRole("button", { name: /Сохранить/ }));
    await settle(200);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Настройка обложки" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Создание продукта" })).toBeInTheDocument();
    expect(toastFn.success).toHaveBeenCalledWith("Фото добавлено");
  });
});

// ---- Round 3: the window's titles and first section -----------------------------------
describe("the editor window", () => {
  it("is titled «Создание продукта» with a «Создать» button for a new product", async () => {
    renderTab();
    await openEditor(user);

    expect(screen.getByRole("dialog", { name: "Создание продукта" })).toBeInTheDocument();
    expect(submitButton(/^Создать$/)).toHaveAttribute("type", "submit");
    expect(within(editor()).queryByRole("button", { name: /^Сохранить$/ })).not.toBeInTheDocument();
  });

  it("is titled «Редактирование продукта» with a «Сохранить» button for an existing one", async () => {
    await openExisting(user);

    expect(screen.getByRole("dialog", { name: "Редактирование продукта" })).toBeInTheDocument();
    expect(submitButton(/^Сохранить$/)).toBeInTheDocument();
  });

  it("opens the Details section straight away for a new product", async () => {
    renderTab();
    await user.click(screen.getByRole("button", { name: /^Создать$/ }));
    await screen.findByRole("dialog");

    expect(screen.getByRole("button", { name: /^Детали/ })).toHaveAttribute("data-state", "open");
    expect(screen.getByLabelText("description")).toBeInTheDocument();
  });

  it("fills the whole screen, so there is nowhere outside it to click", async () => {
    renderTab();
    await openEditor(user);

    expect(editor().className).toMatch(/\bh-\[100dvh\]/);
    expect(editor().className).toMatch(/\bw-screen\b/);
    expect(editor().className).toMatch(/\bmax-w-none\b/);
    expect(editor().className).toMatch(/\brounded-none\b/);
  });

  it("ignores a click on the backdrop", async () => {
    renderTab();
    await openEditor(user);

    const overlay = document.querySelector("[data-state='open'].fixed.inset-0") as HTMLElement;
    fireEvent.pointerDown(overlay);
    await settle(100);

    expect(screen.getByRole("dialog", { name: "Создание продукта" })).toBeInTheDocument();
  });
});

// ---- Round 3: saving happens only on the button ---------------------------------------
describe("a new product is created only by «Создать»", () => {
  it("writes nothing while the seller types, even with every required field filled", async () => {
    renderTab();
    await openEditor(user);
    await fillRequired(user);
    await settle(5000);

    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("keeps the window open and reports what is missing when the form is incomplete", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT Preparation");

    await user.click(submitButton(/^Создать$/));
    await settle(100);

    expect(createMutate).not.toHaveBeenCalled();
    expect(toastFn.error).toHaveBeenCalled();
    expect(editor()).toBeInTheDocument();
  });

  it("creates the product as private and closes the window", async () => {
    renderTab();
    await openEditor(user);
    await fillRequired(user);

    await user.click(submitButton(/^Создать$/));
    await settle(200);

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      title: "SAT Preparation",
      category_id: CATEGORY_ID,
      subcategory_id: SUBCATEGORY_ID,
      is_active: false,
    });
    expect(toastFn).toHaveBeenCalledWith(expect.stringMatching(/приватный/));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("creates only one product when «Создать» is pressed twice quickly", async () => {
    let finish!: () => void;
    createMutate.mockImplementationOnce(
      () => new Promise((resolve) => { finish = () => resolve({ id: "new-product", slug: "sat" }); }),
    );
    renderTab();
    await openEditor(user);
    await fillRequired(user);

    await user.click(submitButton(/^Создать$/));
    await settle(50);
    expect(submitButton(/Создать/)).toBeDisabled();
    fireEvent.click(submitButton(/Создать/));
    await act(async () => { finish(); });
    await settle(200);

    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open with the data intact when creating fails", async () => {
    createMutate.mockRejectedValueOnce(new Error("network down"));
    renderTab();
    await openEditor(user);
    await fillRequired(user);

    await user.click(submitButton(/^Создать$/));
    await settle(200);

    expect(toastFn.error).toHaveBeenCalledWith("network down");
    expect(editor()).toBeInTheDocument();
    expect(document.getElementById("title")).toHaveValue("SAT Preparation");
  });
});

describe("an existing product is saved only by «Сохранить»", () => {
  it("writes nothing while the seller types", async () => {
    await openExisting(user);

    await typeTitle(" v2");
    await settle(5000);

    expect(updateMutate).not.toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("updates that same product, leaves publishing alone, and closes", async () => {
    await openExisting(user);
    await typeTitle(" v2");

    await user.click(submitButton(/^Сохранить$/));
    await settle(200);

    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "p1", title: "Existing course v2" });
    expect(updateMutate.mock.calls[0][0]).not.toHaveProperty("is_active");
    expect(updateMutate.mock.calls[0][0]).not.toHaveProperty("is_paused");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

// ---- Round 3: leaving the window --------------------------------------------------------
const HINT = "Вы точно хотите выйти? Изменения не сохранятся.";

describe("closing the window with the cross", () => {
  it("closes at once when nothing was changed", async () => {
    renderTab();
    await openEditor(user);

    await user.click(closeButton());
    await settle(100);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("first shows a red warning under the cross when there are unsaved changes", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT");

    await user.click(closeButton());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(HINT);
    expect(alert).toHaveClass("text-destructive");
    expect(editor()).toBeInTheDocument();
  });

  it("closes on the second click, discarding the changes", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT");

    await user.click(closeButton());
    await user.click(closeButton());
    await settle(100);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("treats Escape exactly like the cross", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT");

    await user.keyboard("{Escape}");
    expect(screen.getByRole("alert")).toHaveTextContent(HINT);
    expect(editor()).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await settle(100);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("drops the warning after a few seconds, so a later click warns again", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT");

    await user.click(closeButton());
    await settle(4500);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(closeButton());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(editor()).toBeInTheDocument();
  });

  it("drops the warning when the seller goes back to editing", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT");

    await user.click(closeButton());
    await typeTitle(" Prep");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(closeButton());
    expect(editor()).toBeInTheDocument();
  });

  it("warns for an existing product too", async () => {
    await openExisting(user);
    await typeTitle("!");

    await user.click(closeButton());

    expect(screen.getByRole("alert")).toHaveTextContent(HINT);
  });

  it("starts the next new product from a blank form", async () => {
    renderTab();
    await openEditor(user);
    await typeTitle("SAT");
    await user.click(closeButton());
    await user.click(closeButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openEditor(user);

    expect(document.getElementById("title")).toHaveValue("");
  });
});
