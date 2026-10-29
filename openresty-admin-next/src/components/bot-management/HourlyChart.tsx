"use client";

import { useMemo, useState } from "react";
import type { BotClass, BotStatsRow } from "./api";
import { fmtNumber } from "./api";

/* Requests per hour, stacked by class.  Colours were run through the
   dataviz validator against the dashboard's own card surfaces (#ffffff and
   #122233); both modes pass.  The light yellow is below 3:1 on white, so
   identity never rests on colour alone: legend + tooltip + a table view, and
   2px surface gaps between segments. */

const SERIES: { key: BotClass; label: string; light: string; dark: string }[] = [
  { key: "human", label: "Human", light: "bg-[#0ca30c]", dark: "dark:bg-[#0ca30c]" },
  { key: "verified_bot", label: "Verified crawler", light: "bg-[#2a78d6]", dark: "dark:bg-[#3987e5]" },
  { key: "suspect", label: "Suspect", light: "bg-[#eda100]", dark: "dark:bg-[#c98500]" },
  { key: "bot", label: "Bot", light: "bg-[#d03b3b]", dark: "dark:bg-[#d03b3b]" },
];

const PLOT_HEIGHT = 160;

function hourLabel(epoch: number) {
  return new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HourlyChart({ rows }: { rows: BotStatsRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const totals = useMemo(
    () => rows.map((r) => SERIES.reduce((sum, s) => sum + (r.class[s.key] ?? 0), 0)),
    [rows],
  );
  const max = Math.max(1, ...totals);
  const empty = totals.every((t) => t === 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${s.light} ${s.dark}`} />
              {s.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 font-medium">Hour</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right font-medium">{s.label}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.hour} className="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-300">
                  <td className="px-3 py-1.5">{hourLabel(r.hour)}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">{fmtNumber(r.class[s.key])}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{fmtNumber(totals[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : empty ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No scored requests in this window yet.
        </div>
      ) : (
        <div className="relative">
          {/* Recessive grid: baseline + the max line, labelled. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200 dark:border-slate-700" />
          <span className="pointer-events-none absolute -top-2 right-0 bg-white px-1 text-[10px] text-slate-500 dark:bg-[#122233] dark:text-slate-400">
            {fmtNumber(max)}
          </span>
          <div className="flex items-end gap-[2px] border-b border-slate-300 dark:border-slate-600" style={{ height: PLOT_HEIGHT }}>
            {rows.map((r, i) => {
              const h = Math.round((totals[i] / max) * (PLOT_HEIGHT - 8));
              return (
                <div
                  key={r.hour}
                  className="relative flex h-full flex-1 cursor-default items-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((v) => (v === i ? null : v))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((v) => (v === i ? null : v))}
                  tabIndex={0}
                  aria-label={`${hourLabel(r.hour)}: ${SERIES.map((s) => `${s.label} ${r.class[s.key] ?? 0}`).join(", ")}`}
                >
                  {/* Stack, baseline-anchored, rounded data-end, 2px surface gaps. */}
                  <div
                    className="flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                    style={{ height: totals[i] > 0 ? Math.max(h, 2) : 0 }}
                  >
                    {SERIES.map((s) => {
                      const v = r.class[s.key] ?? 0;
                      if (!v) return null;
                      return <div key={s.key} className={`${s.light} ${s.dark}`} style={{ flexGrow: v, minHeight: 1 }} />;
                    })}
                  </div>
                  {hover === i && (
                    <div
                      role="tooltip"
                      className="absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="mb-1 font-medium text-slate-900 dark:text-slate-100">{hourLabel(r.hour)}</div>
                      {SERIES.map((s) => (
                        <div key={s.key} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-sm ${s.light} ${s.dark}`} />
                            {s.label}
                          </span>
                          <span className="tabular-nums">{fmtNumber(r.class[s.key])}</span>
                        </div>
                      ))}
                      <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-medium text-slate-900 dark:border-slate-800 dark:text-slate-100">
                        <span>Total</span>
                        <span className="tabular-nums">{fmtNumber(totals[i])}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span>{rows[0] ? hourLabel(rows[0].hour) : ""}</span>
            <span>now</span>
          </div>
        </div>
      )}
    </div>
  );
}
