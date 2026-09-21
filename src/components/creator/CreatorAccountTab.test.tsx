import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeApi = vi.fn();
vi.mock("@/lib/sessionApi", () => ({
  invokeApi: (...args: unknown[]) => invokeApi(...args),
  creatorCreds: () => ({}),
}));

vi.mock("@/contexts/SimpleAuthContext", () => ({
  useSimpleAuth: () => ({ profiles: [] }),
}));

const settingsProps = vi.fn();
vi.mock("@/components/account/AccountSettingsView", () => ({
  default: (props: Record<string, unknown>) => {
    settingsProps(props);
    return <div data-testid="settings" />;
  },
}));

import CreatorAccountTab from "@/components/creator/CreatorAccountTab";

beforeEach(() => {
  invokeApi.mockReset();
  settingsProps.mockReset();
  localStorage.clear();
});

describe("CreatorAccountTab join date", () => {
  // This used to be a localStorage timestamp written on first view, which meant
  // "on the platform since" showed the day the seller first opened settings.
  it("takes the join date from the profile record, not local storage", async () => {
    invokeApi.mockResolvedValue({ createdAt: "2024-03-05T10:00:00.000Z" });

    render(<CreatorAccountTab creatorName="SAT Academy" />);

    await waitFor(() => {
      const last = settingsProps.mock.calls.at(-1)?.[0] as { createdAt?: Date | null };
      expect(last?.createdAt).toEqual(new Date("2024-03-05T10:00:00.000Z"));
    });

    expect(invokeApi).toHaveBeenCalledWith(
      "manage-profile",
      expect.objectContaining({ action: "get_handle" }),
    );
  });

  it("writes no fabricated date into local storage", async () => {
    invokeApi.mockResolvedValue({ createdAt: "2024-03-05T10:00:00.000Z" });

    render(<CreatorAccountTab creatorName="SAT Academy" />);

    await waitFor(() => expect(invokeApi).toHaveBeenCalled());
    expect(localStorage.getItem("creator_created_at")).toBeNull();
  });

  it("shows no join date at all when the backend has none", async () => {
    invokeApi.mockResolvedValue({});

    render(<CreatorAccountTab creatorName="SAT Academy" />);

    await waitFor(() => expect(invokeApi).toHaveBeenCalled());
    const last = settingsProps.mock.calls.at(-1)?.[0] as { createdAt?: Date | null };
    expect(last?.createdAt).toBeNull();
  });

  it("survives a failed profile lookup without crashing", async () => {
    invokeApi.mockRejectedValue(new Error("network"));

    const { getByTestId } = render(<CreatorAccountTab creatorName="SAT Academy" />);

    await waitFor(() => expect(invokeApi).toHaveBeenCalled());
    expect(getByTestId("settings")).toBeInTheDocument();
  });
});
