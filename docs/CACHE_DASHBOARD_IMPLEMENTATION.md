# Cache Dashboard Implementation Guide

This guide shows how to add comprehensive cache statistics visualization to the OpenResty Admin Dashboard.

## Backend Implementation ✅ COMPLETE

The following backend components are already implemented:

### Prometheus Metrics (prometheus_metrics.lua)
```lua
- nginx_cache_enabled{host} - Cache enabled status per host
- nginx_cache_hits_total{host, extension} - Total cache hits
- nginx_cache_misses_total{host, extension} - Total cache misses
- nginx_cache_bypasses_total{host, reason} - Cache bypasses
- nginx_cache_stores_total{host, extension, content_type} - Stored items
- nginx_cache_size_bytes{host} - Cache size in bytes
- nginx_cache_entries_total{host} - Total cached entries
- nginx_cache_evictions_total{host, reason} - Cache evictions
- nginx_cache_hit_ratio{host} - Calculated hit ratio
```

### API Endpoint
**GET /api/cache/stats**

Response format:
```json
{
  "data": {
    "available": true,
    "total_entries": 1250,
    "total_size_bytes": 52428800,
    "total_size_mb": 50.0,
    "entries_by_host": [
      {"host": "example.com", "count": 850},
      {"host": "api.example.com", "count": 400}
    ],
    "entries_by_extension": [
      {"extension": "js", "count": 450},
      {"extension": "css", "count": 320},
      {"extension": "png", "count": 280},
      {"extension": "jpg", "count": 200}
    ],
    "top_urls": [
      {"url": "/static/bundle.js", "host": "example.com", "size": 2097152, "key": "example.com:/static/bundle.js"},
      {"url": "/images/hero.jpg", "host": "example.com", "size": 1048576}
    ],
    "cache_dict_capacity": 104857600,
    "cache_dict_free_space": 52428800
  }
}
```

### DataProvider Function
```javascript
getCacheStats: async () => {
  // Fetches /api/cache/stats endpoint
  // Returns cache statistics data
}
```

## Frontend Implementation 🔧 TO DO

Add the following to `openresty-admin/src/Dashboard/Dashboard.jsx`:

### 1. Add State Variables

Add after line 414 (after logMetrics state):

```javascript
const [cacheStats, setCacheStats] = React.useState({
  available: false,
  total_entries: 0,
  total_size_bytes: 0,
  total_size_mb: 0,
  entries_by_host: [],
  entries_by_extension: [],
  top_urls: [],
  cache_dict_capacity: 0,
  cache_dict_free_space: 0,
});
```

### 2. Add Fetch Function

Add after fetchLogMetrics function (around line 497):

```javascript
const fetchCacheStats = React.useCallback(() => {
  dataProvider
    .getCacheStats()
    .then((response) => {
      const data = response?.data || {};
      setCacheStats({
        available: data.available || false,
        total_entries: data.total_entries || 0,
        total_size_bytes: data.total_size_bytes || 0,
        total_size_mb: data.total_size_mb || 0,
        entries_by_host: Array.isArray(data.entries_by_host) ? data.entries_by_host : [],
        entries_by_extension: Array.isArray(data.entries_by_extension) ? data.entries_by_extension : [],
        top_urls: Array.isArray(data.top_urls) ? data.top_urls : [],
        cache_dict_capacity: data.cache_dict_capacity || 0,
        cache_dict_free_space: data.cache_dict_free_space || 0,
      });
    })
    .catch((error) => {
      console.log("Failed to fetch cache stats:", error);
      setCacheStats({
        available: false,
        total_entries: 0,
        total_size_bytes: 0
      });
    });
}, [dataProvider]);
```

### 3. Update useEffect

Add fetchCacheStats to the useEffect hook (line 515):

```javascript
React.useEffect(() => {
  fetchErrorLogs();
  fetchAccessLogs();
  fetchTrafficStats();
  fetchLogMetrics();
  fetchCacheStats();  // ADD THIS LINE

  // ... rest of useEffect
```

### 4. Add Cache Statistics Chart

Add this new chart component AFTER the "Log Level Metrics" chart (around line 2046):

```jsx
{/* Cache Statistics - Full Width */}
<Box sx={{ mb: 3, width: "100%" }}>
  <ChartCard
    title="Cache Statistics & Performance"
    subtitle="Static content caching with nginx shared dictionary"
    onRefresh={fetchCacheStats}
    height="auto"
    accentColor="#06b6d4"
  >
    {cacheStats.available ? (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          py: 2,
        }}
      >
        {/* Summary Cards */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
              md: "1fr 1fr 1fr 1fr",
            },
            gap: 2,
          }}
        >
          {[
            {
              label: "Total Entries",
              value: formatNumber(cacheStats.total_entries),
              color: theme.palette.info.main,
              icon: StorageIcon,
            },
            {
              label: "Cache Size",
              value: `${cacheStats.total_size_mb} MB`,
              color: theme.palette.primary.main,
              icon: DataUsageIcon,
            },
            {
              label: "Free Space",
              value: formatBytes(cacheStats.cache_dict_free_space),
              color: theme.palette.success.main,
              icon: StorageIcon,
            },
            {
              label: "Capacity",
              value: formatBytes(cacheStats.cache_dict_capacity),
              color: theme.palette.warning.main,
              icon: StorageIcon,
            },
          ].map((item, index) => (
            <Box
              key={index}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: `1px solid ${alpha(item.color, 0.3)}`,
                backgroundColor: alpha(item.color, 0.05),
                display: "flex",
                alignItems: "center",
                gap: 2,
                transition: "all 0.2s",
                "&:hover": {
                  backgroundColor: alpha(item.color, 0.08),
                  transform: "translateY(-2px)",
                  boxShadow: `0 4px 12px ${alpha(item.color, 0.2)}`,
                },
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: alpha(item.color, 0.15),
                }}
              >
                <item.icon sx={{ fontSize: 24, color: item.color }} />
              </Box>
              <Box>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 700,
                    color: item.color,
                    fontSize: "1.5rem",
                    lineHeight: 1.2,
                  }}
                >
                  {item.value}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.palette.text.secondary,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Cache Distribution Charts */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "1fr 1fr",
            },
            gap: 3,
          }}
        >
          {/* Cache by Host */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              backgroundColor: alpha(theme.palette.background.paper, 0.5),
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight={700}
              sx={{ mb: 2 }}
            >
              Cache Distribution by Host
            </Typography>
            <Box sx={{ maxHeight: 250, overflow: "auto" }}>
              {cacheStats.entries_by_host.slice(0, 10).map((item, index) => {
                const total = cacheStats.total_entries || 1;
                const percentage = Math.round((item.count / total) * 100);
                return (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1.25,
                      px: 0.5,
                      borderRadius: 1,
                      transition: "all 0.2s",
                      "&:hover": {
                        backgroundColor: alpha(
                          theme.palette.primary.main,
                          0.05,
                        ),
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          index < 3
                            ? alpha(theme.palette.primary.main, 0.15)
                            : alpha(theme.palette.grey[500], 0.1),
                        color:
                          index < 3
                            ? theme.palette.primary.main
                            : theme.palette.text.secondary,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.host}
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mt: 0.5,
                        }}
                      >
                        <Box
                          sx={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: alpha(
                              theme.palette.primary.main,
                              0.1,
                            ),
                            overflow: "hidden",
                          }}
                        >
                          <Box
                            sx={{
                              width: `${percentage}%`,
                              height: "100%",
                              borderRadius: 2,
                              background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.7)})`,
                            }}
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.secondary,
                            fontSize: "0.7rem",
                            minWidth: 40,
                          }}
                        >
                          {percentage}%
                        </Typography>
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: theme.palette.text.primary,
                        fontSize: "0.85rem",
                        minWidth: 50,
                        textAlign: "right",
                      }}
                    >
                      {formatNumber(item.count)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Cache by Extension */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              backgroundColor: alpha(theme.palette.background.paper, 0.5),
            }}
          >
            <Typography
              variant="subtitle1"
              fontWeight={700}
              sx={{ mb: 2 }}
            >
              Cache by File Extension
            </Typography>
            <Box sx={{ maxHeight: 250, overflow: "auto" }}>
              {cacheStats.entries_by_extension.slice(0, 10).map((item, index) => {
                const total = cacheStats.total_entries || 1;
                const percentage = Math.round((item.count / total) * 100);
                const extColor = {
                  js: theme.palette.warning.main,
                  css: theme.palette.info.main,
                  png: theme.palette.success.main,
                  jpg: theme.palette.error.main,
                  svg: theme.palette.secondary.main,
                }[item.extension] || theme.palette.grey[500];

                return (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1.25,
                      px: 0.5,
                      borderRadius: 1,
                      transition: "all 0.2s",
                      "&:hover": {
                        backgroundColor: alpha(extColor, 0.05),
                      },
                    }}
                  >
                    <Chip
                      label={`.${item.extension}`}
                      size="small"
                      sx={{
                        minWidth: 52,
                        height: 26,
                        backgroundColor: alpha(extColor, 0.15),
                        color: extColor,
                        fontWeight: 700,
                        fontSize: "0.7rem",
                        fontFamily: "monospace",
                        "& .MuiChip-label": { px: 1 },
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Box
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: alpha(extColor, 0.1),
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            width: `${percentage}%`,
                            height: "100%",
                            borderRadius: 3,
                            background: `linear-gradient(90deg, ${extColor}, ${alpha(extColor, 0.6)})`,
                          }}
                        />
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: theme.palette.text.primary,
                        fontSize: "0.85rem",
                        minWidth: 50,
                        textAlign: "right",
                      }}
                    >
                      {formatNumber(item.count)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: "0.7rem",
                        minWidth: 40,
                        textAlign: "right",
                      }}
                    >
                      {percentage}%
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* Top Cached URLs */}
        <Box
          sx={{
            p: 2.5,
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            backgroundColor: alpha(theme.palette.background.paper, 0.5),
          }}
        >
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ mb: 2 }}
          >
            Top Cached URLs (by size)
          </Typography>
          <Box sx={{ maxHeight: 300, overflow: "auto" }}>
            {cacheStats.top_urls.slice(0, 20).map((item, index) => (
              <Box
                key={index}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  py: 1,
                  px: 0.5,
                  borderRadius: 1,
                  transition: "all 0.2s",
                  "&:hover": {
                    backgroundColor: alpha(
                      theme.palette.info.main,
                      0.05,
                    ),
                  },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    minWidth: 24,
                    color: theme.palette.text.secondary,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}
                >
                  #{index + 1}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.url}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      fontSize: "0.7rem",
                    }}
                  >
                    {item.host}
                  </Typography>
                </Box>
                <Chip
                  label={formatBytes(item.size)}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    backgroundColor: alpha(
                      theme.palette.info.main,
                      0.15,
                    ),
                    color: theme.palette.info.main,
                  }}
                />
              </Box>
            ))}
          </Box>
        </Box>

        {/* Prometheus Metrics Info */}
        <Box
          sx={{
            p: 2.5,
            borderRadius: 2,
            background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.08)} 0%, ${alpha(theme.palette.success.main, 0.08)} 100%)`,
            border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
          }}
        >
          <Typography
            variant="body2"
            fontWeight={700}
            color="text.primary"
            sx={{ mb: 1 }}
          >
            Cache Metrics in Prometheus
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1, lineHeight: 1.5 }}
          >
            Cache performance metrics are tracked in real-time including hits,
            misses, bypasses, and hit ratios. Monitor cache efficiency with
            these Prometheus queries:
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1.5,
              mt: 1.5,
            }}
          >
            {[
              "rate(nginx_cache_hits_total[5m])",
              "rate(nginx_cache_misses_total[5m])",
              "nginx_cache_hit_ratio",
              "nginx_cache_entries_total",
            ].map((query, idx) => (
              <Box
                key={idx}
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  backgroundColor: alpha(
                    theme.palette.background.paper,
                    0.8,
                  ),
                  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                  color: theme.palette.info.main,
                  fontWeight: 600,
                }}
              >
                {query}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    ) : (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: alpha(theme.palette.warning.main, 0.1),
          }}
        >
          <StorageIcon
            sx={{ fontSize: 32, color: theme.palette.warning.main }}
          />
        </Box>
        <Typography
          variant="body2"
          color="text.secondary"
          fontWeight={500}
        >
          Cache statistics not available
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Ensure cache shared dictionary is configured
        </Typography>
      </Box>
    )}
  </ChartCard>
</Box>
```

## Implementation Checklist

- [x] Backend: Add Prometheus cache metrics
- [x] Backend: Create /api/cache/stats endpoint
- [x] Backend: Implement cache data aggregation
- [x] Frontend: Add getCacheStats to dataProvider
- [ ] Frontend: Add cacheStats state to Dashboard
- [ ] Frontend: Add fetchCacheStats function
- [ ] Frontend: Call fetchCacheStats in useEffect
- [ ] Frontend: Add Cache Statistics chart component
- [ ] Test: Verify metrics are being collected
- [ ] Test: Check dashboard displays correctly

## Testing

After implementation, verify:

1. **Backend API**: `curl http://localhost:8080/api/cache/stats`
2. **Prometheus Metrics**: Visit `http://localhost:8080/metrics` and search for `nginx_cache_`
3. **Dashboard**: Check the cache statistics chart displays correctly
4. **Real-time Updates**: Verify cache stats update when refreshing

## Prometheus Queries for Grafana

```promql
# Cache hit rate over time
rate(nginx_cache_hits_total[5m])

# Cache miss rate
rate(nginx_cache_misses_total[5m])

# Cache hit ratio
nginx_cache_hit_ratio

# Total cached entries
nginx_cache_entries_total

# Cache size
nginx_cache_size_bytes

# Cache bypasses by reason
rate(nginx_cache_bypasses_total[5m])

# Cache storage rate by file extension
rate(nginx_cache_stores_total{extension="js"}[5m])
```

## Notes

- The cache uses nginx shared dictionary (`wsl_cache` and `wsl_cache_keys`)
- Cache keys are formatted as `{host}:{uri}[?{args}]`
- Cache statistics are calculated on-demand by iterating cached entries
- For large caches (>10k entries), consider adding pagination to top_urls
- Cache TTL is managed by nginx's TTL expiry mechanism

---

**Implementation Status**: Backend Complete ✅ | Frontend In Progress 🔧
