import { useCallback, useEffect, useRef, useState } from "react";

const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL ?? "";

export interface SearchResponse<T = unknown> {
  results: T[];
  total?: number;
}

interface UseSearchOptions {
  debounceMs?: number;
  endpoint?: string;
}

/** Debounced full-text search that cancels stale requests and ignores late responses. */
export function useSearch<T = unknown>({ debounceMs = 300, endpoint = "/api/search" }: UseSearchOptions = {}) {
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const clearPending = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    controller.current?.abort();
    controller.current = null;
  }, []);

  const search = useCallback((rawQuery: string) => {
    const query = rawQuery.trim();
    generation.current += 1;
    const currentGeneration = generation.current;
    clearPending();
    setError(null);

    if (!query) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    timer.current = setTimeout(async () => {
      timer.current = null;
      const requestController = new AbortController();
      controller.current = requestController;
      try {
        const response = await fetch(
          `${INDEXER_API_URL}${endpoint}?q=${encodeURIComponent(query)}`,
          { signal: requestController.signal }
        );
        if (!response.ok) throw new Error(`Search request failed (${response.status})`);
        const payload = (await response.json()) as SearchResponse<T> | T[];
        const nextResults = Array.isArray(payload) ? payload : payload.results;
        if (generation.current === currentGeneration && controller.current === requestController) {
          setResults(nextResults);
          setError(null);
        }
      } catch (err) {
        if (requestController.signal.aborted) return;
        if (generation.current === currentGeneration) {
          setResults([]);
          setError(err instanceof Error ? err.message : "Search request failed");
        }
      } finally {
        if (generation.current === currentGeneration && controller.current === requestController) {
          controller.current = null;
          setIsLoading(false);
        }
      }
    }, debounceMs);
  }, [clearPending, debounceMs, endpoint]);

  const clearResults = useCallback(() => {
    generation.current += 1;
    clearPending();
    setResults([]);
    setIsLoading(false);
    setError(null);
  }, [clearPending]);

  useEffect(() => () => clearPending(), [clearPending]);

  return { results, isLoading, error, search, clearResults };
}
