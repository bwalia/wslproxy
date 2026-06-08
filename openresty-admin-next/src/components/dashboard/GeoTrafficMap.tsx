"use client";

import React, { useMemo, useState, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

// ── Types ────────────────────────────────────────────────────────────────

interface GeoEntry {
  country_code: string; // Alpha-2
  requests: number;
}

interface GeoTrafficMapProps {
  geoData: GeoEntry[] | null;
  loading: boolean;
}

// ── Alpha-2 → ISO 3166-1 numeric (used by world-atlas TopoJSON) ─────────

const ALPHA2_TO_NUMERIC: Record<string, string> = {
  AF: "004",
  AL: "008",
  DZ: "012",
  AR: "032",
  AU: "036",
  AT: "040",
  BD: "050",
  BE: "056",
  BR: "076",
  BG: "100",
  CA: "124",
  CL: "152",
  CN: "156",
  CO: "170",
  HR: "191",
  CZ: "203",
  DK: "208",
  EG: "818",
  FI: "246",
  FR: "250",
  DE: "276",
  GR: "300",
  HK: "344",
  HU: "348",
  IN: "356",
  ID: "360",
  IR: "364",
  IQ: "368",
  IE: "372",
  IL: "376",
  IT: "380",
  JP: "392",
  KZ: "398",
  KE: "404",
  KR: "410",
  MY: "458",
  MX: "484",
  MA: "504",
  NL: "528",
  NZ: "554",
  NG: "566",
  NO: "578",
  PK: "586",
  PE: "604",
  PH: "608",
  PL: "616",
  PT: "620",
  RO: "642",
  RU: "643",
  SA: "682",
  SG: "702",
  ZA: "710",
  ES: "724",
  SE: "752",
  CH: "756",
  TW: "158",
  TH: "764",
  TR: "792",
  UA: "804",
  AE: "784",
  GB: "826",
  US: "840",
  VN: "704",
  VE: "862",
  // Additional common countries
  EC: "218",
  GH: "288",
  ET: "231",
  TZ: "834",
  UG: "800",
  CM: "120",
  SN: "686",
  CI: "384",
  AO: "024",
  MZ: "508",
  MG: "450",
  LK: "144",
  MM: "104",
  NP: "524",
  KH: "116",
  UZ: "860",
  GE: "268",
  AM: "051",
  AZ: "031",
  BY: "112",
  LT: "440",
  LV: "428",
  EE: "233",
  RS: "688",
  SK: "703",
  SI: "705",
  BA: "070",
  MK: "807",
  ME: "499",
  IS: "352",
  LU: "442",
  MT: "470",
  CY: "196",
  JO: "400",
  LB: "422",
  KW: "414",
  QA: "634",
  BH: "048",
  OM: "512",
  YE: "887",
  SY: "760",
  LY: "434",
  TN: "788",
  SD: "729",
  DO: "214",
  CR: "188",
  PA: "591",
  CU: "192",
  GT: "320",
  HN: "340",
  SV: "222",
  NI: "558",
  PY: "600",
  UY: "858",
  BO: "068",
  TT: "780",
  JM: "388",
};

// ── Alpha-2 → country name (for sidebar / tooltip) ─────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  AF: "Afghanistan",
  AL: "Albania",
  DZ: "Algeria",
  AR: "Argentina",
  AU: "Australia",
  AT: "Austria",
  BD: "Bangladesh",
  BE: "Belgium",
  BR: "Brazil",
  BG: "Bulgaria",
  CA: "Canada",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  HR: "Croatia",
  CZ: "Czech Republic",
  DK: "Denmark",
  EG: "Egypt",
  FI: "Finland",
  FR: "France",
  DE: "Germany",
  GR: "Greece",
  HK: "Hong Kong",
  HU: "Hungary",
  IN: "India",
  ID: "Indonesia",
  IR: "Iran",
  IQ: "Iraq",
  IE: "Ireland",
  IL: "Israel",
  IT: "Italy",
  JP: "Japan",
  KZ: "Kazakhstan",
  KE: "Kenya",
  KR: "South Korea",
  MY: "Malaysia",
  MX: "Mexico",
  MA: "Morocco",
  NL: "Netherlands",
  NZ: "New Zealand",
  NG: "Nigeria",
  NO: "Norway",
  PK: "Pakistan",
  PE: "Peru",
  PH: "Philippines",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  RU: "Russia",
  SA: "Saudi Arabia",
  SG: "Singapore",
  ZA: "South Africa",
  ES: "Spain",
  SE: "Sweden",
  CH: "Switzerland",
  TW: "Taiwan",
  TH: "Thailand",
  TR: "Turkey",
  UA: "Ukraine",
  AE: "UAE",
  GB: "United Kingdom",
  US: "United States",
  VN: "Vietnam",
  VE: "Venezuela",
};

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ── Color helpers ────────────────────────────────────────────────────────

const COLOR_SCALE = [
  "#e0e7ff", // primary-100 equivalent
  "#a5b4fc", // primary-300
  "#6366f1", // primary-500
  "#4338ca", // primary-700
];

function getColor(value: number, maxLog: number): string {
  if (value === 0) return "";
  const logVal = Math.log10(value + 1);
  const t = maxLog > 0 ? logVal / maxLog : 0;
  const idx = Math.min(
    Math.floor(t * COLOR_SCALE.length),
    COLOR_SCALE.length - 1,
  );
  return COLOR_SCALE[idx];
}

// ── Top countries sidebar ────────────────────────────────────────────────

interface TopCountriesProps {
  entries: GeoEntry[];
  total: number;
}

const TopCountries = React.memo(function TopCountries({
  entries,
  total,
}: TopCountriesProps) {
  const top10 = useMemo(() => entries.slice(0, 10), [entries]);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        Top Countries
      </h3>
      <div className="space-y-1.5">
        {top10.map((entry, i) => {
          const pct = total > 0 ? (entry.requests / total) * 100 : 0;
          const name = COUNTRY_NAMES[entry.country_code] ?? entry.country_code;
          return (
            <div
              key={entry.country_code}
              className="flex items-center gap-2 text-xs"
            >
              <span className="w-4 shrink-0 text-right font-medium text-slate-400">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">
                {name}
              </span>
              {/* Fixed-width right-aligned count so the name column's
                  flex-1 share is constant across rows (otherwise a
                  6-digit count steals width from the name on row 1
                  while a 2-digit count gives it back on row 10,
                  shifting bars around).  Tabular-nums is set on
                  body globally — see globals.css. */}
              <span className="w-14 shrink-0 text-right font-medium text-slate-600 dark:text-slate-400">
                {entry.requests.toLocaleString()}
              </span>
              <div className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ── Main component ───────────────────────────────────────────────────────

const GeoTrafficMap: React.FC<GeoTrafficMapProps> = ({ geoData, loading }) => {
  const [tooltip, setTooltip] = useState<{
    name: string;
    requests: number;
  } | null>(null);

  const { numericMap, sorted, total, maxLog } = useMemo(() => {
    const entries = Array.isArray(geoData) ? geoData : [];
    const nMap = new Map<string, number>();
    let maxVal = 0;

    for (const entry of entries) {
      const numeric = ALPHA2_TO_NUMERIC[entry.country_code?.toUpperCase()];
      if (numeric) {
        nMap.set(numeric, (nMap.get(numeric) ?? 0) + entry.requests);
        if (entry.requests > maxVal) maxVal = entry.requests;
      }
    }

    const sortedEntries = [...entries].sort((a, b) => b.requests - a.requests);
    const sum = entries.reduce((s, e) => s + e.requests, 0);

    return {
      numericMap: nMap,
      sorted: sortedEntries,
      total: sum,
      maxLog: Math.log10(maxVal + 1),
    };
  }, [geoData]);

  const handleMouseEnter = useCallback(
    (geo: { properties: { name?: string }; id?: string }) => {
      const id = geo.id ?? "";
      const requests = numericMap.get(id) ?? 0;
      const name = geo.properties.name ?? id;
      setTooltip({ name, requests });
    },
    [numericMap],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (loading) {
    return (
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Geographic Traffic Distribution
          </h2>
        </Card.Header>
        <Card.Body>
          <Skeleton variant="rectangular" className="h-100 w-full" />
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Geographic Traffic Distribution
        </h2>
      </Card.Header>
      <Card.Body className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Map */}
          <div className="relative flex-1">
            <ComposableMap
              width={800}
              height={400}
              projectionConfig={{ scale: 140 }}
              className="w-full h-auto"
            >
              <ZoomableGroup>
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const id = geo.id as string;
                      const requests = numericMap.get(id) ?? 0;
                      const fill =
                        requests > 0
                          ? getColor(requests, maxLog)
                          : "var(--geo-empty, #e2e8f0)";

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={fill}
                          stroke="#cbd5e1"
                          strokeWidth={0.5}
                          onMouseEnter={() =>
                            handleMouseEnter(
                              geo as unknown as {
                                properties: { name?: string };
                                id?: string;
                              },
                            )
                          }
                          onMouseLeave={handleMouseLeave}
                          style={{
                            default: { outline: "none" },
                            hover: { outline: "none", opacity: 0.8 },
                            pressed: { outline: "none" },
                          }}
                          className="dark:[--geo-empty:#334155]"
                        />
                      );
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>

            {/* Tooltip overlay */}
            {tooltip && (
              <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm shadow backdrop-blur dark:border-slate-700 dark:bg-slate-800/90">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {tooltip.name}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  {tooltip.requests.toLocaleString()} requests
                </p>
              </div>
            )}

            {/* Color legend */}
            <div className="flex items-center justify-center gap-2 px-6 pb-4 pt-2">
              <span className="text-xs text-slate-400">Low</span>
              <div className="flex h-2 w-32 overflow-hidden rounded-full">
                {COLOR_SCALE.map((color, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-400">High</span>
            </div>
          </div>

          {/* Right sidebar — desktop only.
              Bumped from w-56 (224px) to w-72 (288px) so country names
              like "Switzerland", "United Kingdom" stop being
              truncated to "Switzerl…", "Uni…".  The country column
              uses flex-1 + truncate but had ~88px of usable width at
              w-56 once the rank, count, and bar took their fixed
              shares.  72 / 18rem fits every country in our
              COUNTRY_NAMES table at the current 12px size. */}
          <div className="hidden w-72 shrink-0 border-t p-4 lg:block lg:border-l lg:border-t-0 border-slate-200 dark:border-slate-800">
            <TopCountries entries={sorted} total={total} />
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default React.memo(GeoTrafficMap);
