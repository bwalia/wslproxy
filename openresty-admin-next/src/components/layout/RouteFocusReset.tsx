"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Moves keyboard focus to `<main id="main-content">` on every route
 * change.  Without this, screen-reader users navigating with a link
 * stay focused on the (now-replaced) link element, which causes the
 * next Tab press to jump to wherever the old element was in the DOM —
 * confusing and inaccessible.
 *
 * The main element is focusable because the dashboard layout sets
 * `tabIndex={-1}` on it.  Focus is applied without scrolling via
 * `focus({ preventScroll: true })` so in-page anchors still work.
 *
 * Skips the very first render so the user's initial focus (typically
 * the first interactive element) isn't hijacked.
 */
export default function RouteFocusReset() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const main = document.getElementById("main-content");
    if (main instanceof HTMLElement) {
      main.focus({ preventScroll: true });
    }
  }, [pathname]);

  return null;
}
