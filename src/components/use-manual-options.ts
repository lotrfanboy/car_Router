"use client";
import { useEffect, useState } from "react";
import type { SearchOption } from "./search-combobox";
export function useManualOptions(
  type: "brands" | "models" | "versions" | "cities",
  parent = "",
  model = "",
) {
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<{
      key: string;
      options: SearchOption[];
      error: boolean;
    }>({ key: "", options: [], error: false });
  const enabled =
    type === "brands" || (!!parent && (type !== "versions" || !!model));
  const params = new URLSearchParams({ type });
  if (type === "cities") params.set("state", parent);
  else {
    if (parent) params.set("brand", parent);
    if (model) params.set("model", model);
  }
  const url = `/api/${type === "cities" ? "search-options" : "manual-options"}?${params}`,
    key = `${url}:${attempt}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const data = await response.json();
        const options = Array.isArray(data) ? data : data.options;
        if (!Array.isArray(options)) throw Error();
        return options as SearchOption[];
      })
      .then((options) => {
        if (!controller.signal.aborted)
          setState({ key, options, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, options: [], error: true });
      });
    return () => controller.abort();
  }, [enabled, key, url]);
  return {
    options: enabled && state.key === key ? state.options : [],
    loading: enabled && state.key !== key,
    error: enabled && state.key === key && state.error,
    retry: () => setAttempt((v) => v + 1),
  };
}
