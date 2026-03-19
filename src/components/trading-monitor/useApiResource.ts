"use client";

import { useEffect, useState } from "react";

interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useApiResource<T>(url: string | null) {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    error: null,
    loading: Boolean(url),
  });

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    const controller = new AbortController();
    let active = true;

    setState((current) => ({
      data: current.data,
      error: null,
      loading: true,
    }));

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
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        setState((current) => ({
          data: current.data,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);

  return state;
}
