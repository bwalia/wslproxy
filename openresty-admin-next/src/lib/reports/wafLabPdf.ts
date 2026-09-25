/* Render a WAF Test Lab report (see wafLabReport.ts) to a PDF download.
 *
 * jsPDF + jspdf-autotable are imported on demand, so the ~300 KB of PDF code
 * loads only when someone clicks "Download PDF". The standard PDF fonts cover
 * Latin-1 only, so verdicts are written as PASS/FAIL, not ✓/✗.
 */

import type { WafLabReport, ReportRow } from "./wafLabReport.ts";
import { reportFileName } from "./wafLabReport.ts";

type RGB = [number, number, number];
const INK: RGB = [15, 23, 42];
const MUTED: RGB = [100, 116, 139];
const RULE: RGB = [226, 232, 240];
const GREEN: RGB = [22, 163, 74];
const RED: RGB = [220, 38, 38];
const AMBER: RGB = [217, 119, 6];
const HEAD: RGB = [30, 41, 59];

/** Standard fonts are WinAnsi: replace what they cannot draw. */
function latin1(s: string): string {
  return s
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/→/g, "->")
    .replace(/[^\x00-\xff]/g, "?");
}

function fmt(d: Date | null): string {
  if (!d) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function verdictText(r: ReportRow): string {
  if (r.pass === null) return "not run";
  return r.pass ? "PASS" : "FAIL";
}

function outcomeText(r: ReportRow): string {
  if (r.outcome === "error") return `error: ${r.error}`;
  return r.outcome;
}

/** Build the report document (no download); used by the download and by tests. */
export async function renderWafLabPdf(report: WafLabReport) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const lastY = () =>
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? M;
  const s = report.summary;

  // ── Title block ──────────────────────────────────────────────────────────
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("WAF Test Lab report", M, M + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const meta = [
    `Target: ${report.target || "-"}`,
    `Environment: ${report.environment}`,
    `Run: ${fmt(report.startedAt)} to ${fmt(report.finishedAt)}`,
    `Generated: ${fmt(report.generatedAt)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
  ];
  doc.text(latin1(meta.join("    ")), M, M + 26);

  // ── Verdict banner ───────────────────────────────────────────────────────
  const bannerY = M + 38;
  const [bannerColor, bannerText] =
    s.protection === "active"
      ? [GREEN, `WAF ACTIVE - blocked ${s.blocked} of ${s.reached} requests that got an answer`]
      : s.protection === "exposed"
        ? [RED, `EXPOSED - only ${s.blocked} of ${s.reached} requests that got an answer were blocked`]
        : [AMBER, `NOT ENOUGH DATA - ${s.reached} request(s) got an answer; run at least 3`];
  doc.setFillColor(...bannerColor);
  doc.roundedRect(M, bannerY, W - 2 * M, 26, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(latin1(bannerText), M + 10, bannerY + 17);

  // ── Summary figures ──────────────────────────────────────────────────────
  autoTable(doc, {
    startY: bannerY + 36,
    margin: { left: M, right: M },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: RULE },
    headStyles: { fillColor: HEAD, textColor: 255 },
    head: [["Tests in catalog", "Ran", "Got an answer", "Relay errors", "Blocked", "Block rate",
      "Behaved as expected", "Did not"]],
    body: [[
      String(s.catalogSize),
      String(s.ran),
      String(s.reached),
      String(s.errors),
      String(s.blocked),
      s.blockRatePct == null ? "-" : `${s.blockRatePct}%`,
      String(s.asExpected),
      String(s.unexpected),
    ]],
  });

  // ── Per category ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("By category", M, lastY() + 22);
  autoTable(doc, {
    startY: lastY() + 28,
    margin: { left: M, right: M },
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 4, textColor: INK },
    headStyles: { fillColor: HEAD, textColor: 255 },
    head: [["Category", "Tests", "Ran", "Blocked", "As expected"]],
    body: report.groups.map((g) => [
      latin1(g.group),
      String(g.tests),
      String(g.ran),
      String(g.blocked),
      `${g.asExpected} / ${g.ran}`,
    ]),
    didParseCell: (d) => {
      if (d.section !== "body" || d.column.index !== 4) return;
      const g = report.groups[d.row.index];
      if (g.ran === 0) return;
      d.cell.styles.textColor = g.asExpected === g.ran ? GREEN : RED;
      d.cell.styles.fontStyle = "bold";
    },
  });

  // ── Every test ───────────────────────────────────────────────────────────
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Results", M, M + 8);
  autoTable(doc, {
    startY: M + 16,
    margin: { left: M, right: M, bottom: 40 },
    // Keep each attack on one page; a split row orphans its note lines.
    rowPageBreak: "avoid",
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 3.5, textColor: INK, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: HEAD, textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20, halign: "right" },
      1: { cellWidth: 150 },
      2: { cellWidth: 44 },
      3: { cellWidth: 150, font: "courier" },
      4: { cellWidth: 40 },
      5: { cellWidth: 38, halign: "right" },
      6: { cellWidth: 82 },
      7: { cellWidth: "auto", font: "courier" },
      8: { cellWidth: 44, halign: "right" },
      9: { cellWidth: 44, halign: "center" },
    },
    head: [["#", "Attack", "Method", "Path", "Expect", "Status", "Outcome", "Rule / violation / support id",
      "ms", "Verdict"]],
    body: report.rows.map((r) => [
      String(r.index),
      latin1(r.notes ? `${r.name}\n${r.group} - ${r.notes}` : `${r.name}\n${r.group}`),
      r.method,
      latin1(r.path),
      r.expect,
      r.status || "-",
      latin1(outcomeText(r)),
      latin1([r.rule, r.supportId].filter(Boolean).join("\n") || "-"),
      r.latencyMs == null ? "-" : String(r.latencyMs),
      verdictText(r),
    ]),
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const row = report.rows[d.row.index];
      if (d.column.index === 9) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = row.pass === null ? MUTED : row.pass ? GREEN : RED;
      }
      if (d.column.index === 6 && row.outcome === "error") d.cell.styles.textColor = AMBER;
    },
  });

  // ── Footer on every page ─────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE);
    doc.line(M, H - 28, W - M, H - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      latin1(`WSLProxy WAF Test Lab - ${report.target} - only test hosts you are authorised to test`),
      M,
      H - 16,
    );
    doc.text(`Page ${i} of ${pages}`, W - M, H - 16, { align: "right" });
  }

  return doc;
}

export async function downloadWafLabPdf(report: WafLabReport): Promise<string> {
  const doc = await renderWafLabPdf(report);
  const name = reportFileName(report.target, report.generatedAt);
  doc.save(name);
  return name;
}
