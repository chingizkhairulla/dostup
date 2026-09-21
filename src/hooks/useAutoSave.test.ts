import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "@/hooks/useAutoSave";

type Props = { value: string; saveKey: string; enabled: boolean; canSave: boolean };

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

function setup(save: (v: string) => Promise<void>, initial: Partial<Props> = {}) {
  const base: Props = { value: "a", saveKey: "a", enabled: true, canSave: true, ...initial };
  const hook = renderHook((p: Props) => useAutoSave({ ...p, save, delay: 1000 }), {
    initialProps: base,
  });
  const change = (next: Partial<Props>) => hook.rerender({ ...base, ...next });
  return { ...hook, change, base };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoSave: when it saves", () => {
  it("does not save the value the window opened with", async () => {
    const save = vi.fn(async () => {});
    setup(save);

    await advance(5000);

    expect(save).not.toHaveBeenCalled();
  });

  it("saves once, after a pause in the changes", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(999);
    expect(save).not.toHaveBeenCalled();
    await advance(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
  });

  it("folds a burst of changes into one save of the latest value", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(600);
    change({ value: "bc", saveKey: "bc" });
    await advance(600);
    change({ value: "bcd", saveKey: "bcd" });
    await advance(1000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("bcd");
  });

  it("does not save when the change was undone before the pause ended", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(500);
    change({ value: "a", saveKey: "a" });
    await advance(5000);

    expect(save).not.toHaveBeenCalled();
  });

  it("does not save the same value twice", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(1000);
    await advance(5000);

    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("useAutoSave: incomplete values", () => {
  it("saves nothing, and reports nothing, while the value cannot be saved", async () => {
    const save = vi.fn(async () => {});
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b", canSave: false });
    await advance(5000);

    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("saves as soon as the value becomes complete", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save);

    change({ value: "b", saveKey: "b", canSave: false });
    await advance(2000);
    change({ value: "b", saveKey: "b", canSave: true });
    await advance(1000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
  });
});

describe("useAutoSave: never two saves at once", () => {
  it("waits for a running save, then saves the change made meanwhile", async () => {
    const first = deferred();
    let active = 0;
    let maxActive = 0;
    const save = vi
      .fn<(v: string) => Promise<void>>()
      .mockImplementationOnce(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await first.promise;
        active--;
      })
      .mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        active--;
      });
    const { change } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(1000);
    expect(save).toHaveBeenCalledTimes(1);

    change({ value: "bc", saveKey: "bc" });
    await advance(1000);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => { first.resolve(); await vi.advanceTimersByTimeAsync(0); });
    await advance(0);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("bc");
    expect(maxActive).toBe(1);
  });
});

describe("useAutoSave: status", () => {
  it("goes saving then saved", async () => {
    const d = deferred();
    const save = vi.fn(() => d.promise);
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(1000);
    expect(result.current.status).toBe("saving");

    await act(async () => { d.resolve(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe("saved");
  });

  it("reports an error and does not retry on its own", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(1000);
    await advance(10000);

    expect(result.current.status).toBe("error");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("tries again on the next change after an error", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(1000);
    change({ value: "bc", saveKey: "bc" });
    await advance(1000);

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });
});

describe("useAutoSave: flush (closing the window)", () => {
  it("saves pending changes immediately instead of waiting for the pause", async () => {
    const save = vi.fn(async () => {});
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(200);
    await act(async () => { await result.current.flush(); });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
  });

  it("does not save again afterwards when the timer would have fired", async () => {
    const save = vi.fn(async () => {});
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b" });
    await act(async () => { await result.current.flush(); });
    await advance(5000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is nothing new to save", async () => {
    const save = vi.fn(async () => {});
    const { result } = setup(save);

    await act(async () => { await result.current.flush(); });

    expect(save).not.toHaveBeenCalled();
  });

  it("waits for a save that is already running, then saves what changed since", async () => {
    const first = deferred();
    const save = vi
      .fn<(v: string) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(1000);
    change({ value: "bc", saveKey: "bc" });

    let flushed = false;
    let flushPromise!: Promise<void>;
    await act(async () => {
      flushPromise = result.current.flush().then(() => { flushed = true; });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(flushed).toBe(false);

    await act(async () => { first.resolve(); await flushPromise; });

    expect(flushed).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("bc");
  });
});

describe("useAutoSave: sessions", () => {
  it("stops saving while disabled", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save);

    change({ value: "b", saveKey: "b", enabled: false });
    await advance(5000);

    expect(save).not.toHaveBeenCalled();
  });

  it("drops a pending save when disabled", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(500);
    change({ value: "b", saveKey: "b", enabled: false });
    await advance(5000);

    expect(save).not.toHaveBeenCalled();
  });

  // A dialog reopened for another product starts with that product's data, which
  // is already saved; it must not be written back as if it were a change.
  it("does not save the starting value of a new session", async () => {
    const save = vi.fn(async () => {});
    const { change } = setup(save, { enabled: false, value: "x", saveKey: "x" });

    change({ value: "other", saveKey: "other", enabled: true });
    await advance(5000);

    expect(save).not.toHaveBeenCalled();
  });

  it("clears the status when a session ends", async () => {
    const save = vi.fn(async () => {});
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b" });
    await advance(1000);
    expect(result.current.status).toBe("saved");

    change({ value: "b", saveKey: "b", enabled: false });
    expect(result.current.status).toBe("idle");
  });
});

describe("useAutoSave: hasUnsaved", () => {
  it("is false when nothing has changed", () => {
    const { result } = setup(vi.fn(async () => {}));
    expect(result.current.hasUnsaved()).toBe(false);
  });

  // Lets the window warn that typed-in work could not be saved, instead of
  // closing on it silently.
  it("is true for a change that cannot be saved yet", async () => {
    const save = vi.fn(async () => {});
    const { change, result } = setup(save);

    change({ value: "b", saveKey: "b", canSave: false });
    await act(async () => { await result.current.flush(); });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.hasUnsaved()).toBe(true);
  });

  it("is false again once the change has been saved", async () => {
    const { change, result } = setup(vi.fn(async () => {}));

    change({ value: "b", saveKey: "b" });
    await act(async () => { await result.current.flush(); });

    expect(result.current.hasUnsaved()).toBe(false);
  });

  it("is false outside a session", () => {
    const { result } = setup(vi.fn(async () => {}), { enabled: false, value: "x", saveKey: "x" });
    expect(result.current.hasUnsaved()).toBe(false);
  });
});
