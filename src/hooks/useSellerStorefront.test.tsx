import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { useSellerStorefront } from "@/hooks/useSellerStorefront";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    handle: "sat-academy",
    display_name: "SAT Academy",
    avatar_url: null,
    type: "creator",
    bio: "Мы готовим учеников к SAT",
    created_at: "2026-04-17T00:00:00.000Z",
    avg_rating: "4.80",
    review_count: 243,
    sales_count: 152,
    products: [],
    ...overrides,
  };
}

beforeEach(() => {
  rpc.mockReset();
});

describe("useSellerStorefront", () => {
  it("fetches the storefront in a single rpc call", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });

    const { result } = renderHook(() => useSellerStorefront("sat-academy"), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_seller_storefront", { p_handle: "sat-academy" });
  });

  // Postgres numerics arrive as strings; the UI calls .toFixed on the rating.
  it("coerces the metrics to numbers", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });

    const { result } = renderHook(() => useSellerStorefront("sat-academy"), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.avg_rating).toBe(4.8);
    expect(result.current.data?.review_count).toBe(243);
    expect(result.current.data?.sales_count).toBe(152);
    expect(result.current.data?.created_at).toBe("2026-04-17T00:00:00.000Z");
  });

  it("defaults missing metrics to zero rather than NaN", async () => {
    rpc.mockResolvedValue({
      data: [row({ avg_rating: null, review_count: null, sales_count: null })],
      error: null,
    });

    const { result } = renderHook(() => useSellerStorefront("sat-academy"), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.avg_rating).toBe(0);
    expect(result.current.data?.review_count).toBe(0);
    expect(result.current.data?.sales_count).toBe(0);
  });

  it("returns null for an unknown handle", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useSellerStorefront("nobody"), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("does not query without a handle", () => {
    const { result } = renderHook(() => useSellerStorefront(undefined), { wrapper });

    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.isFetched).toBe(false);
  });

  it("normalises the product rows it passes to the grid", async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          products: [
            { id: "p1", title: "SAT", price: "49000", has_schedule: null },
          ],
        }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useSellerStorefront("sat-academy"), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.products[0].price).toBe(49000);
    expect(result.current.data?.products[0].has_schedule).toBe(false);
  });
});
