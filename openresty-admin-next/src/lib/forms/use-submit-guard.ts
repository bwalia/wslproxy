"use client";

import { useCallback, useRef } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   `useSubmitGuard()` — prevent duplicate submissions while a request
   is in flight.

   The problem: state-based "disable button" pattern (e.g.
   `setSaving(true)` + `disabled={saving}`) has a one-render delay.
   On a slow network the user can rapid-fire-click and trigger the
   submit handler multiple times before React paints the disabled
   state.  Result: 5 POSTs, 5 toasts, possibly 5 server records.

   This hook uses a `useRef` flag that flips synchronously inside the
   handler — the second click sees `inFlight.current === true` and
   returns immediately.  Combine with the existing button `disabled`
   state for visual feedback; the ref guard is the actual protection.

   Usage:

       const guard = useSubmitGuard();
       const handleSubmit = guard(async (values) => {
         await dataProvider.create("foo", values);
       });
   ────────────────────────────────────────────────────────────────────────── */

export function useSubmitGuard() {
  const inFlight = useRef(false);

  // Wrap any async function so a second invocation while the first is
  // still pending is dropped.  Generic over the wrapped function's
  // signature so types flow through unchanged.
  return useCallback(
    <Args extends unknown[], R>(
      fn: (...args: Args) => Promise<R>,
    ): ((...args: Args) => Promise<R | void>) => {
      return async (...args: Args) => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
          return await fn(...args);
        } finally {
          inFlight.current = false;
        }
      };
    },
    [],
  );
}
