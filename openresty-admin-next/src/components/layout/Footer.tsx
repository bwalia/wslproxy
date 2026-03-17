"use client";

import React from "react";
import { env } from "@/lib/config/env";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 py-3 text-center text-xs text-slate-400 dark:border-slate-800">
      WSL Proxy v{env.appVersion} | Build {env.buildNumber}
    </footer>
  );
}
