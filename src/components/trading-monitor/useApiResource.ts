"use client";

import { useEffect, useState } from "react";

interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface UseApiResourceOptions {
  refreshKey?: number;
  onRequestStateChange?: (request: { loading: boolean; refreshKey: number }) => void;
}

export function useApiResource<T>(url: string | null, options: UseApiResourceOptions = {}) {
  const refreshKey = options.refreshKey ?? 0;
  const onRequestStateChange = options.onRequestStateChange;
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    error: null,
    loading: Boolean(url),
  });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!url) {
      return;
    }

    const refresh = () => setRefreshTick((current) => current + 1);
    const interval = window.setInterval(refresh, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [url]);

  useEffect(() => {
    if (!url) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    let requestSettled = false;

    const notifyRequestState = (loading: boolean) => {
      onRequestStateChange?.({ loading, refreshKey });
    };

    const settleRequest = () => {
      if (requestSettled) {
        return;
      }

      requestSettled = true;
      notifyRequestState(false);
    };

    queueMicrotask(() => {
      if (!active || controller.signal.aborted) {
        return;
      }

      setState({
        data: null,
        error: null,
        loading: true,
      });
      notifyRequestState(true);
    });

    fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Request failed");
        }

        return payload as T;
      })
      .then((data) => {
        if (!active) {
          return;
        }

        setState({
          data,
          error: null,
          loading: false,
        });
        settleRequest();
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) {
          settleRequest();
          return;
        }

        setState((current) => ({
          data: current.data,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
        settleRequest();
      });

    return () => {
      active = false;
      controller.abort();
      settleRequest();
    };
  }, [onRequestStateChange, refreshKey, refreshTick, url]);

  if (!url) {
    return { data: null, error: null, loading: false };
  }

  return state;
}
