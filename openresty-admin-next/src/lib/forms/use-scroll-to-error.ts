"use client";

import { useCallback } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   `useScrollToFirstFieldError()` — returns an imperative function that
   smooth-scrolls to the first input rendered with `aria-invalid="true"`
   and focuses it.

   Imperative on purpose:
     The earlier reactive version (a `useEffect` watching the field-errors
     map) yanked focus out from under the user.  As soon as they typed
     into the offending input, our `set()` helper cleared that field's
     error, the errors map shrank, the effect re-fired, and the cursor
     jumped to the next invalid field — before the user had finished
     fixing the current one.

     The right contract is: scroll only when *we* decide to (i.e. right
     after a failed submit).  Per-keystroke edits should never relocate
     the cursor.

   Usage:

       const scrollToFirstError = useScrollToFirstFieldError();
       const handleSubmit = useCallback(async () => {
         const gate = runValidationGate(schema, form);
         if (!gate.ok) {
           setFieldErrors(gate.fieldErrors);
           setActiveTab(findTabForError(...));   // optional
           scrollToFirstError();                  // ← single call
           return;
         }
         ...
       }, [...]);

   Implementation notes:
     - Two `requestAnimationFrame`s are needed.  The first lets React
       commit the new error state (so `aria-invalid` is rendered); the
       second lets layout settle before we measure the target's position.
       This also gives a tab switch a frame to mount the new tab content.
     - Focus is deferred ~250ms past the scroll start so the smooth
       animation isn't aborted by the browser snapping focus into view.
   ────────────────────────────────────────────────────────────────────────── */

export function useScrollToFirstFieldError() {
  return useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        );
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => {
          if (typeof target.focus === "function") {
            target.focus({ preventScroll: true });
          }
        }, 250);
      });
    });
  }, []);
}
