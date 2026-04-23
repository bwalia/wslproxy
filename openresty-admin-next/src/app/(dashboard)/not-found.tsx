import type { Metadata } from "next";
import Link from "next/link";
import { FileQuestion } from "lucide-react";

export const metadata: Metadata = {
  title: "Not found — WSL Proxy Admin",
};

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800"
          aria-hidden="true"
        >
          <FileQuestion className="h-7 w-7 text-slate-600 dark:text-slate-300" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          Resource not found
        </h2>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          The resource you&rsquo;re looking for doesn&rsquo;t exist or may have been deleted.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-slate-900"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
