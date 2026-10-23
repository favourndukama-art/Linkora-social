import { act, renderHook, waitFor } from "@testing-library/react";
import { useSearch } from "./useSearch";

describe("useSearch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ id: "result-1" }] }),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("waits for the debounce interval and performs one request", async () => {
    const { result } = renderHook(() => useSearch({ debounceMs: 300, endpoint: "/search" }));

    act(() => result.current.search("hello"));
    expect(global.fetch).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(299));
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.results).toEqual([{ id: "result-1" }]));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("clearResults resets results, loading, and error state", async () => {
    const { result } = renderHook(() => useSearch({ debounceMs: 100 }));
    act(() => result.current.search("hello"));
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    act(() => result.current.clearResults());
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("aborts the previous request when the query changes", async () => {
    let firstSignal: AbortSignal | undefined;
    global.fetch = jest.fn().mockImplementation((_url: string, options: RequestInit) => {
      firstSignal = options.signal as AbortSignal;
      return new Promise(() => undefined);
    });
    const { result } = renderHook(() => useSearch({ debounceMs: 100 }));

    act(() => result.current.search("first"));
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(firstSignal?.aborted).toBe(false);

    act(() => result.current.search("second"));
    expect(firstSignal?.aborted).toBe(true);
  });
});
