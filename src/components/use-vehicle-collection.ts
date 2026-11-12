"use client";
import { useEffect, useMemo, useState } from "react";
import type { Listing } from "@/lib/discovery";
import { collectionKey, type CollectionEntry } from "@/lib/vehicle-collection";
import { useWorkspace } from "./workspace";
export function useVehicleCollection() {
  const workspace = useWorkspace();
  const { reconcileListings } = workspace;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ rows: Listing[] | null; error: string }>(
    { rows: null, error: "" },
  );
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/listings", { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Listing[]>;
      })
      .then((rows) => {
        if (abort.signal.aborted) return;
        setState({ rows, error: "" });
        reconcileListings(
          rows.map((listing) => collectionKey({ kind: "listing", listing })),
        );
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setState((previous) => ({
            ...previous,
            error: "Não foi possível carregar os salvos da busca.",
          }));
      });
    return () => abort.abort();
  }, [attempt, reconcileListings]);
  const entries = useMemo<CollectionEntry[]>(
    () => [
      ...(state.rows ?? []).map((listing) => ({
        kind: "listing" as const,
        listing,
      })),
      ...workspace.vehicles.map((vehicle) => ({
        kind: "manual" as const,
        vehicle,
      })),
    ],
    [state.rows, workspace.vehicles],
  );
  return {
    entries,
    listings: state.rows,
    manuals: workspace.vehicles,
    listingError: state.error,
    manualError: workspace.error,
    manualLoading: workspace.loading,
    loading: (state.rows === null && !state.error) || workspace.loading,
    selected: workspace.comparisonKeys,
    select: (entry: CollectionEntry) =>
      workspace.toggleSelection(collectionKey(entry)),
    clear: workspace.clearSelection,
    retryListings: () => {
      setState((previous) => ({ ...previous, error: "" }));
      setAttempt((value) => value + 1);
    },
    retryManuals: () => void workspace.reload(),
    removeListing: (listing: Listing) => {
      const next = (state.rows ?? []).filter(
        (row) =>
          row.source !== listing.source ||
          row.externalId !== listing.externalId,
      );
      setState({ rows: next, error: "" });
      reconcileListings(
        next.map((row) => collectionKey({ kind: "listing", listing: row })),
      );
    },
  };
}
