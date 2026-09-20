"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Settings is intentionally a single-record read-only view in this
 * admin — there's no per-id detail page.  The mutable bits that
 * legacy react-admin exposed via a settings form are surfaced
 * elsewhere instead:
 *
 *   - Storage type → Settings page `<StorageSettingsCard />` and AppBar chip
 *   - Active environment profile → AppBar `<ProfileSwitcher />`
 *   - Password → `/account/password`
 *
 * Other settings (JWT secret, captcha keys, IP2Location path) are
 * deployment concerns that ops edit in `data/settings.json` directly
 * — never editable from the UI for security reasons.
 *
 * This stub exists so that any link of the form `/settings/<id>`
 * (e.g. accidental bookmarks, copy-paste from logs) bounces cleanly
 * to the read-only overview rather than 404.
 */
export default function SettingsDetailPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings");
  }, [router]);

  return null;
}
