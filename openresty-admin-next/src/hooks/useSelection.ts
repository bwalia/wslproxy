"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Row selection for a paginated DataTable.
 *
 * DataTable keeps selected ids across pages, so a selection can include rows
 * that are no longer on screen. This hook remembers a display label for every
 * id it has seen, so a bulk-delete confirmation can still name them.
 */
export function useSelection<T>(
  rows: T[],
  getId: (row: T) => string,
  getLabel: (row: T) => string,
) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const labels = useRef(new Map<string, string>());

  // Remember labels for whatever is on the current page.
  for (const row of rows) {
    labels.current.set(getId(row), getLabel(row));
  }

  const clear = useCallback(() => setSelectedIds([]), []);

  const selectedItems = useMemo(
    () =>
      selectedIds.map((id) => ({
        id,
        label: labels.current.get(id) ?? id,
      })),
    [selectedIds],
  );

  return {
    selectedIds,
    setSelectedIds,
    selectedItems,
    clear,
    count: selectedIds.length,
  };
}
