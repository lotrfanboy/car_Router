"use client";
import { useCallback, useEffect, useState } from "react";
import type { Listing } from "@/lib/discovery";
import { listingKey } from "@/lib/listing-comparison";
import {
  readListingSelection,
  reconcileListingSelection,
  toggleListingSelection,
  writeListingSelection,
} from "@/lib/listing-selection";
export function useSavedListings() {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/listings", { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Listing[]>;
      })
      .then((listings) => {
        if (abort.signal.aborted) return;
        const next = reconcileListingSelection(
          readListingSelection(),
          listings,
        );
        setRows(listings);
        setSelected(next);
        writeListingSelection(next);
        setError("");
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Não foi possível carregar seus anúncios salvos.");
      });
    return () => abort.abort();
  }, [revision]);
  const select = useCallback(
    (row: Listing) => {
      const next = toggleListingSelection(selected, row);
      setSelected(next);
      writeListingSelection(next);
    },
    [selected],
  );
  const remove = useCallback(
    (row: Listing) => {
      setRows(
        (previous) =>
          previous?.filter((item) => listingKey(item) !== listingKey(row)) ??
          null,
      );
      const next = selected.filter((key) => key !== listingKey(row));
      setSelected(next);
      writeListingSelection(next);
    },
    [selected],
  );
  return {
    rows,
    selected,
    error,
    select,
    remove,
    retry: () => {
      setError("");
      setRevision((value) => value + 1);
    },
    clear: () => {
      setSelected([]);
      writeListingSelection([]);
    },
  };
}
