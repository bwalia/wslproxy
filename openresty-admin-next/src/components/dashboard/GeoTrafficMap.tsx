'use client';

import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  useTheme,
  alpha,
  Tooltip as MuiTooltip,
} from '@mui/material';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { useThemeMode } from '@/providers/ThemeProvider';

// TopoJSON world map from CDN
const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO Alpha-2 to ISO Alpha-3 country code mapping
const countryCodeMap: Record<string, string> = {
  AF: 'AFG', AL: 'ALB', DZ: 'DZA', AS: 'ASM', AD: 'AND', AO: 'AGO', AI: 'AIA',
  AQ: 'ATA', AG: 'ATG', AR: 'ARG', AM: 'ARM', AW: 'ABW', AU: 'AUS', AT: 'AUT',
  AZ: 'AZE', BS: 'BHS', BH: 'BHR', BD: 'BGD', BB: 'BRB', BY: 'BLR', BE: 'BEL',
  BZ: 'BLZ', BJ: 'BEN', BM: 'BMU', BT: 'BTN', BO: 'BOL', BA: 'BIH', BW: 'BWA',
  BR: 'BRA', BN: 'BRN', BG: 'BGR', BF: 'BFA', BI: 'BDI', KH: 'KHM', CM: 'CMR',
  CA: 'CAN', CV: 'CPV', KY: 'CYM', CF: 'CAF', TD: 'TCD', CL: 'CHL', CN: 'CHN',
  CO: 'COL', KM: 'COM', CG: 'COG', CD: 'COD', CR: 'CRI', CI: 'CIV', HR: 'HRV',
  CU: 'CUB', CY: 'CYP', CZ: 'CZE', DK: 'DNK', DJ: 'DJI', DM: 'DMA', DO: 'DOM',
  EC: 'ECU', EG: 'EGY', SV: 'SLV', GQ: 'GNQ', ER: 'ERI', EE: 'EST', ET: 'ETH',
  FJ: 'FJI', FI: 'FIN', FR: 'FRA', GA: 'GAB', GM: 'GMB', GE: 'GEO', DE: 'DEU',
  GH: 'GHA', GR: 'GRC', GL: 'GRL', GD: 'GRD', GT: 'GTM', GN: 'GIN', GW: 'GNB',
  GY: 'GUY', HT: 'HTI', HN: 'HND', HK: 'HKG', HU: 'HUN', IS: 'ISL', IN: 'IND',
  ID: 'IDN', IR: 'IRN', IQ: 'IRQ', IE: 'IRL', IL: 'ISR', IT: 'ITA', JM: 'JAM',
  JP: 'JPN', JO: 'JOR', KZ: 'KAZ', KE: 'KEN', KI: 'KIR', KP: 'PRK', KR: 'KOR',
  KW: 'KWT', KG: 'KGZ', LA: 'LAO', LV: 'LVA', LB: 'LBN', LS: 'LSO', LR: 'LBR',
  LY: 'LBY', LI: 'LIE', LT: 'LTU', LU: 'LUX', MO: 'MAC', MK: 'MKD', MG: 'MDG',
  MW: 'MWI', MY: 'MYS', MV: 'MDV', ML: 'MLI', MT: 'MLT', MH: 'MHL', MR: 'MRT',
  MU: 'MUS', MX: 'MEX', FM: 'FSM', MD: 'MDA', MC: 'MCO', MN: 'MNG', ME: 'MNE',
  MA: 'MAR', MZ: 'MOZ', MM: 'MMR', NA: 'NAM', NR: 'NRU', NP: 'NPL', NL: 'NLD',
  NZ: 'NZL', NI: 'NIC', NE: 'NER', NG: 'NGA', NO: 'NOR', OM: 'OMN', PK: 'PAK',
  PW: 'PLW', PA: 'PAN', PG: 'PNG', PY: 'PRY', PE: 'PER', PH: 'PHL', PL: 'POL',
  PT: 'PRT', PR: 'PRI', QA: 'QAT', RO: 'ROU', RU: 'RUS', RW: 'RWA', KN: 'KNA',
  LC: 'LCA', VC: 'VCT', WS: 'WSM', SM: 'SMR', ST: 'STP', SA: 'SAU', SN: 'SEN',
  RS: 'SRB', SC: 'SYC', SL: 'SLE', SG: 'SGP', SK: 'SVK', SI: 'SVN', SB: 'SLB',
  SO: 'SOM', ZA: 'ZAF', SS: 'SSD', ES: 'ESP', LK: 'LKA', SD: 'SDN', SR: 'SUR',
  SZ: 'SWZ', SE: 'SWE', CH: 'CHE', SY: 'SYR', TW: 'TWN', TJ: 'TJK', TZ: 'TZA',
  TH: 'THA', TL: 'TLS', TG: 'TGO', TO: 'TON', TT: 'TTO', TN: 'TUN', TR: 'TUR',
  TM: 'TKM', TV: 'TUV', UG: 'UGA', UA: 'UKR', AE: 'ARE', GB: 'GBR', US: 'USA',
  UY: 'URY', UZ: 'UZB', VU: 'VUT', VA: 'VAT', VE: 'VEN', VN: 'VNM', YE: 'YEM',
  ZM: 'ZMB', ZW: 'ZWE',
};

// Country names for tooltip display
const countryNames: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', DE: 'Germany', FR: 'France',
  CN: 'China', JP: 'Japan', IN: 'India', BR: 'Brazil', RU: 'Russia',
  AU: 'Australia', CA: 'Canada', IT: 'Italy', ES: 'Spain', MX: 'Mexico',
  KR: 'South Korea', NL: 'Netherlands', SE: 'Sweden', CH: 'Switzerland',
  PL: 'Poland', BE: 'Belgium', AT: 'Austria', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', IE: 'Ireland', PT: 'Portugal', CZ: 'Czech Republic',
  GR: 'Greece', HU: 'Hungary', RO: 'Romania', UA: 'Ukraine', TR: 'Turkey',
  IL: 'Israel', SA: 'Saudi Arabia', AE: 'UAE', EG: 'Egypt', ZA: 'South Africa',
  NG: 'Nigeria', KE: 'Kenya', SG: 'Singapore', TH: 'Thailand', MY: 'Malaysia',
  ID: 'Indonesia', PH: 'Philippines', VN: 'Vietnam', PK: 'Pakistan',
  BD: 'Bangladesh', AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  NZ: 'New Zealand', HK: 'Hong Kong', TW: 'Taiwan',
};

interface GeoDataItem {
  country_code: string;
  requests: number;
}

interface GeoTrafficMapProps {
  data?: GeoDataItem[];
  formatNumber?: (num: number) => string;
}

const GeoTrafficMap: React.FC<GeoTrafficMapProps> = ({ data = [], formatNumber }) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  const formatNum =
    formatNumber ||
    ((num: number) => {
      if (!num) return '0';
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    });

  // Calculate color scale based on request counts
  const { maxRequests, colorScale, dataMap } = useMemo(() => {
    const max = data.length > 0 ? Math.max(...data.map((d) => d.requests)) : 1;

    const dataLookup: Record<string, number> = {};
    data.forEach((item) => {
      const alpha2 = item.country_code;
      dataLookup[alpha2] = item.requests;
      if (countryCodeMap[alpha2]) {
        dataLookup[countryCodeMap[alpha2]] = item.requests;
      }
    });

    return {
      maxRequests: max,
      colorScale: (requests: number) => {
        if (!requests || requests === 0) {
          return isDark
            ? alpha(theme.palette.grey[800], 0.4)
            : alpha(theme.palette.grey[300], 0.6);
        }
        const intensity = Math.log(requests + 1) / Math.log(max + 1);
        return alpha(theme.palette.primary.main, 0.15 + intensity * 0.85);
      },
      dataMap: dataLookup,
    };
  }, [data, isDark, theme]);

  // Get top countries for the legend/list
  const topCountries = useMemo(() => {
    return data.slice(0, 10);
  }, [data]);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', gap: 2 }}>
      {/* Map Container */}
      <Box sx={{ flex: 1, position: 'relative', minHeight: 280 }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            scale: 120,
            center: [0, 30],
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <ZoomableGroup center={[0, 20]} zoom={1} minZoom={1} maxZoom={8}>
            <Geographies geography={geoUrl}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo: any) => {
                  const countryCode = geo.properties.ISO_A3 || geo.id;
                  const requests = dataMap[countryCode] || 0;
                  const countryName =
                    geo.properties.name || geo.properties.NAME || countryCode;

                  return (
                    <MuiTooltip
                      key={geo.rsmKey}
                      title={
                        <Box sx={{ p: 0.5 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {countryName}
                          </Typography>
                          <Typography variant="caption" color="inherit">
                            {requests > 0
                              ? `${formatNum(requests)} requests`
                              : 'No traffic recorded'}
                          </Typography>
                        </Box>
                      }
                      arrow
                      placement="top"
                    >
                      <Geography
                        geography={geo}
                        fill={colorScale(requests)}
                        stroke={
                          isDark
                            ? alpha(theme.palette.grey[600], 0.5)
                            : alpha(theme.palette.grey[400], 0.7)
                        }
                        strokeWidth={0.4}
                        style={{
                          default: { outline: 'none' },
                          hover: {
                            fill:
                              requests > 0
                                ? theme.palette.primary.main
                                : alpha(theme.palette.primary.main, 0.3),
                            stroke: theme.palette.primary.main,
                            strokeWidth: 1,
                            outline: 'none',
                            cursor: 'pointer',
                          },
                          pressed: { outline: 'none' },
                        }}
                      />
                    </MuiTooltip>
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Color Legend */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.background.paper, 0.92),
            border: `1px solid ${theme.palette.divider}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            Traffic
          </Typography>
          <Box
            sx={{
              width: 80,
              height: 8,
              borderRadius: 4,
              background: `linear-gradient(90deg,
                ${alpha(theme.palette.primary.main, 0.15)},
                ${theme.palette.primary.main})`,
            }}
          />
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            {formatNum(maxRequests)}
          </Typography>
        </Box>
      </Box>

      {/* Top Countries List */}
      <Box
        sx={{
          width: 200,
          flexShrink: 0,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          height: '100%',
          maxHeight: 380,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{
            display: 'block',
            mb: 1.5,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          Top Countries
        </Typography>
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          {topCountries.length > 0 ? (
            topCountries.map((country, index) => {
              const percentage = Math.round(
                (country.requests / maxRequests) * 100,
              );
              return (
                <Box
                  key={country.country_code}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 1,
                    py: 0.5,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      width: 20,
                      color: theme.palette.text.disabled,
                      fontWeight: 500,
                    }}
                  >
                    {index + 1}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        mb: 0.25,
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {countryNames[country.country_code] ||
                          country.country_code}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={500}
                      >
                        {formatNum(country.requests)}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${percentage}%`,
                          height: '100%',
                          borderRadius: 2,
                          background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.6)})`,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </Box>
                  </Box>
                </Box>
              );
            })
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="caption" color="text.disabled">
                No traffic data yet
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default GeoTrafficMap;
