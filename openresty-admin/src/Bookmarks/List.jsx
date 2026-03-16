import React from "react";
import {
  useListContext,
  List as RaList,
  SearchInput,
  useDataProvider,
  useNotify,
  useRefresh,
  useRedirect,
} from "react-admin";
import {
  Box,
  Card,
  Chip,
  Typography,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  InputBase,
  Tabs,
  Tab,
  Badge,
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/BookmarkRounded";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorderRounded";
import LaunchIcon from "@mui/icons-material/LaunchRounded";
import LockIcon from "@mui/icons-material/LockRounded";
import LockOpenIcon from "@mui/icons-material/LockOpenRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesomeRounded";
import StarIcon from "@mui/icons-material/StarRounded";
import StarBorderIcon from "@mui/icons-material/StarBorderRounded";
import SearchIcon from "@mui/icons-material/SearchRounded";
import FolderIcon from "@mui/icons-material/FolderRounded";
import DnsIcon from "@mui/icons-material/DnsRounded";
import EditIcon from "@mui/icons-material/EditRounded";
import Empty from "../component/Empty";
import { MyPagination } from "../component/MyPagination";

// ─── Category color mapping ────────────────────────────────────────────────
const CATEGORY_COLORS = {
  production: "#10b981",
  staging: "#f59e0b",
  development: "#6366f1",
  testing: "#ec4899",
  internal: "#8b5cf6",
  api: "#06b6d4",
  frontend: "#3b82f6",
  backend: "#ef4444",
  monitoring: "#14b8a6",
  default: "#64748b",
};

const getCategoryColor = (category) => {
  if (!category) return CATEGORY_COLORS.default;
  const key = category.toLowerCase().trim();
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.default;
};

// ─── Bookmark Card ─────────────────────────────────────────────────────────
const BookmarkCard = ({ record, onPromote }) => {
  const theme = useTheme();
  const redirect = useRedirect();
  const isDark = theme.palette.mode === "dark";
  const isSaved = !record.auto_generated;
  const accentColor = isSaved
    ? theme.palette.primary.main
    : getCategoryColor(record.category);
  const tags = Array.isArray(record.tags) ? record.tags : [];

  return (
    <Card
      onClick={() => redirect("edit", "bookmarks", record.id)}
      sx={{
        p: 0,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
        border: `1px solid ${
          isSaved
            ? alpha(accentColor, 0.3)
            : isDark
              ? alpha(theme.palette.divider, 0.6)
              : theme.palette.divider
        }`,
        background: isDark
          ? `linear-gradient(145deg, ${alpha(accentColor, isSaved ? 0.08 : 0.03)} 0%, ${alpha(theme.palette.background.paper, 0.97)} 100%)`
          : `linear-gradient(145deg, ${alpha(accentColor, isSaved ? 0.05 : 0.02)} 0%, ${theme.palette.background.paper} 100%)`,
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: isDark
            ? `0 16px 32px ${alpha(accentColor, 0.2)}, 0 0 0 1px ${alpha(accentColor, 0.2)}`
            : `0 16px 32px ${alpha(accentColor, 0.12)}, 0 0 0 1px ${alpha(accentColor, 0.1)}`,
          borderColor: alpha(accentColor, 0.4),
          "& .bookmark-actions": { opacity: 1 },
          "& .bookmark-accent-bar": { opacity: 1 },
        },
      }}
    >
      {/* Top accent bar */}
      <Box
        className="bookmark-accent-bar"
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${accentColor}, ${alpha(accentColor, 0.3)})`,
          opacity: isSaved ? 0.8 : 0.4,
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Card Content */}
      <Box sx={{ p: 2.5, pt: 2 }}>
        {/* Header Row */}
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            mb: 1.5,
          }}
        >
          {/* Icon + Title */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: `linear-gradient(135deg, ${accentColor} 0%, ${alpha(accentColor, 0.7)} 100%)`,
                color: "#fff",
                boxShadow: `0 4px 12px ${alpha(accentColor, 0.3)}`,
              }}
            >
              {isSaved ? (
                <BookmarkIcon sx={{ fontSize: 20 }} />
              ) : (
                <DnsIcon sx={{ fontSize: 20 }} />
              )}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: theme.palette.text.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}
              >
                {record.title || record.host}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: alpha(theme.palette.text.secondary, 0.8),
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "block",
                  fontSize: "0.7rem",
                }}
              >
                {record.host}
              </Typography>
            </Box>
          </Box>

          {/* Actions */}
          <Box
            className="bookmark-actions"
            sx={{
              display: "flex",
              gap: 0.25,
              opacity: 0,
              transition: "opacity 0.2s ease",
              ml: 1,
            }}
          >
            {record.auto_generated && (
              <Tooltip title="Save bookmark">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPromote(record);
                  }}
                  sx={{
                    color: theme.palette.text.secondary,
                    "&:hover": {
                      color: theme.palette.warning.main,
                      backgroundColor: alpha(theme.palette.warning.main, 0.1),
                    },
                  }}
                >
                  <StarBorderIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Open site">
              <IconButton
                size="small"
                href={record.url || `https://${record.host}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  color: theme.palette.text.secondary,
                  "&:hover": {
                    color: accentColor,
                    backgroundColor: alpha(accentColor, 0.1),
                  },
                }}
              >
                <LaunchIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  redirect("edit", "bookmarks", record.id);
                }}
                sx={{
                  color: theme.palette.text.secondary,
                  "&:hover": {
                    color: accentColor,
                    backgroundColor: alpha(accentColor, 0.1),
                  },
                }}
              >
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Description */}
        {record.description && (
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.secondary,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              mb: 1.5,
              lineHeight: 1.5,
              fontSize: "0.75rem",
            }}
          >
            {record.description}
          </Typography>
        )}

        {/* Bottom row: badges */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
            mt: "auto",
          }}
        >
          {/* SSL badge */}
          <Chip
            icon={record.ssl_enabled ? <LockIcon /> : <LockOpenIcon />}
            label={record.ssl_enabled ? "SSL" : "HTTP"}
            size="small"
            sx={{
              height: 22,
              fontSize: "0.65rem",
              fontWeight: 600,
              backgroundColor: record.ssl_enabled
                ? alpha(theme.palette.success.main, 0.1)
                : alpha(theme.palette.warning.main, 0.1),
              color: record.ssl_enabled
                ? theme.palette.success.main
                : theme.palette.warning.main,
              border: `1px solid ${alpha(
                record.ssl_enabled
                  ? theme.palette.success.main
                  : theme.palette.warning.main,
                0.2,
              )}`,
              "& .MuiChip-icon": { fontSize: 12, color: "inherit" },
            }}
          />

          {/* Type badge */}
          <Chip
            icon={isSaved ? <StarIcon /> : <AutoAwesomeIcon />}
            label={isSaved ? "Saved" : "Auto"}
            size="small"
            sx={{
              height: 22,
              fontSize: "0.65rem",
              fontWeight: 600,
              backgroundColor: isSaved
                ? alpha(theme.palette.primary.main, 0.1)
                : alpha(theme.palette.grey[500], 0.1),
              color: isSaved
                ? theme.palette.primary.main
                : theme.palette.text.secondary,
              border: `1px solid ${alpha(
                isSaved ? theme.palette.primary.main : theme.palette.grey[500],
                0.2,
              )}`,
              "& .MuiChip-icon": { fontSize: 12, color: "inherit" },
            }}
          />

          {/* Profile */}
          {record.profile_id && (
            <Chip
              label={record.profile_id}
              size="small"
              sx={{
                height: 22,
                fontSize: "0.65rem",
                fontWeight: 500,
                backgroundColor: alpha(theme.palette.info.main, 0.08),
                color: theme.palette.info.main,
                border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
              }}
            />
          )}

          {/* Tags */}
          {tags.slice(0, 2).map((tag, idx) => (
            <Chip
              key={idx}
              label={tag}
              size="small"
              variant="outlined"
              sx={{
                height: 22,
                fontSize: "0.65rem",
                borderColor: alpha(accentColor, 0.3),
                color: accentColor,
              }}
            />
          ))}
          {tags.length > 2 && (
            <Typography variant="caption" color="text.disabled" fontSize="0.65rem">
              +{tags.length - 2}
            </Typography>
          )}
        </Box>
      </Box>
    </Card>
  );
};

// ─── Card Grid (replaces Datagrid) ─────────────────────────────────────────
const BookmarkGrid = () => {
  const { data, isLoading } = useListContext();
  const theme = useTheme();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const isDark = theme.palette.mode === "dark";

  const [activeCategory, setActiveCategory] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const records = data || [];

  const handlePromote = async (record) => {
    try {
      await dataProvider.create("bookmarks", {
        data: {
          ...record,
          id: "bm-" + record.host.replace(/\./g, "-"),
          auto_generated: false,
        },
      });
      notify("Bookmark saved", { type: "success" });
      refresh();
    } catch (err) {
      notify("Failed to save bookmark", { type: "error" });
    }
  };

  // Extract unique categories
  const categories = React.useMemo(() => {
    const cats = new Map();
    cats.set("all", records.length);
    cats.set("saved", records.filter((r) => !r.auto_generated).length);
    records.forEach((r) => {
      const cat = r.category && r.category.trim() !== "" ? r.category.trim() : "Uncategorized";
      cats.set(cat, (cats.get(cat) || 0) + 1);
    });
    return cats;
  }, [records]);

  // Filter records
  const filtered = React.useMemo(() => {
    let result = records;

    // Category filter
    if (activeCategory === "saved") {
      result = result.filter((r) => !r.auto_generated);
    } else if (activeCategory !== "all") {
      result = result.filter((r) => {
        const cat = r.category && r.category.trim() !== "" ? r.category.trim() : "Uncategorized";
        return cat === activeCategory;
      });
    }

    // Local search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.title && r.title.toLowerCase().includes(q)) ||
          (r.host && r.host.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [records, activeCategory, search]);

  // Group by category for display
  const grouped = React.useMemo(() => {
    if (activeCategory !== "all") return null;

    const groups = new Map();
    // Saved bookmarks first
    const saved = filtered.filter((r) => !r.auto_generated);
    if (saved.length > 0) groups.set("Saved Bookmarks", saved);

    // Then by category
    const auto = filtered.filter((r) => r.auto_generated);
    auto.forEach((r) => {
      const cat = r.category && r.category.trim() !== "" ? r.category.trim() : "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(r);
    });

    return groups;
  }, [filtered, activeCategory]);

  if (isLoading) return null;
  if (records.length === 0) return <Empty resource="bookmarks" />;

  const categoryTabs = Array.from(categories.entries());

  return (
    <Box>
      {/* Search + Category Tabs */}
      <Box sx={{ mb: 3 }}>
        {/* Search bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1,
            mb: 2,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: isDark
              ? alpha(theme.palette.background.paper, 0.5)
              : theme.palette.grey[50],
            "&:focus-within": {
              borderColor: theme.palette.primary.main,
              boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.15)}`,
            },
            transition: "all 0.2s ease",
          }}
        >
          <SearchIcon sx={{ color: theme.palette.text.disabled, fontSize: 20 }} />
          <InputBase
            placeholder="Search bookmarks by host, title, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, fontSize: "0.875rem" }}
          />
          {search && (
            <Typography variant="caption" color="text.secondary">
              {filtered.length} results
            </Typography>
          )}
        </Box>

        {/* Category tabs */}
        <Tabs
          value={activeCategory}
          onChange={(_, v) => setActiveCategory(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36,
              py: 0.5,
              px: 2,
              fontSize: "0.8rem",
              fontWeight: 600,
              textTransform: "none",
              borderRadius: 2,
              mr: 0.5,
              minWidth: "auto",
            },
            "& .MuiTabs-indicator": {
              borderRadius: 2,
              height: 3,
            },
          }}
        >
          {categoryTabs.map(([cat, count]) => (
            <Tab
              key={cat}
              value={cat}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  {cat === "all" && <DnsIcon sx={{ fontSize: 16 }} />}
                  {cat === "saved" && <StarIcon sx={{ fontSize: 16 }} />}
                  {cat !== "all" && cat !== "saved" && (
                    <FolderIcon sx={{ fontSize: 16 }} />
                  )}
                  <span>{cat === "all" ? "All" : cat === "saved" ? "Saved" : cat}</span>
                  <Badge
                    badgeContent={count}
                    color={cat === "saved" ? "primary" : "default"}
                    sx={{
                      "& .MuiBadge-badge": {
                        fontSize: "0.6rem",
                        height: 16,
                        minWidth: 16,
                        right: -8,
                        top: -2,
                      },
                    }}
                  />
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>

      {/* Card Grid — grouped or flat */}
      {grouped && activeCategory === "all" ? (
        // Grouped view
        Array.from(grouped.entries()).map(([groupName, items]) => (
          <Box key={groupName} sx={{ mb: 4 }}>
            {/* Category header */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                mb: 2,
                pb: 1,
                borderBottom: `2px solid ${alpha(getCategoryColor(groupName), 0.2)}`,
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: alpha(getCategoryColor(groupName), 0.1),
                  color: getCategoryColor(groupName),
                }}
              >
                {groupName === "Saved Bookmarks" ? (
                  <StarIcon sx={{ fontSize: 18 }} />
                ) : (
                  <FolderIcon sx={{ fontSize: 18 }} />
                )}
              </Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, color: theme.palette.text.primary }}
              >
                {groupName}
              </Typography>
              <Chip
                label={items.length}
                size="small"
                sx={{
                  height: 20,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  backgroundColor: alpha(getCategoryColor(groupName), 0.1),
                  color: getCategoryColor(groupName),
                }}
              />
            </Box>

            {/* Grid */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
                gap: 2,
              }}
            >
              {items.map((record) => (
                <BookmarkCard
                  key={record.id}
                  record={record}
                  onPromote={handlePromote}
                />
              ))}
            </Box>
          </Box>
        ))
      ) : (
        // Flat filtered view
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
              lg: "repeat(4, 1fr)",
            },
            gap: 2,
          }}
        >
          {filtered.map((record) => (
            <BookmarkCard
              key={record.id}
              record={record}
              onPromote={handlePromote}
            />
          ))}
        </Box>
      )}

      {filtered.length === 0 && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            py: 8,
            gap: 1.5,
          }}
        >
          <SearchIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
          <Typography variant="body1" color="text.secondary">
            No bookmarks match your search
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// ─── Main List Component ───────────────────────────────────────────────────
const List = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box sx={{ pt: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.primary.main, 0.7)} 100%)`,
            color: "#fff",
            boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.3)}`,
          }}
        >
          <BookmarkIcon sx={{ fontSize: 26 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800} color="text.primary" letterSpacing="-0.02em">
            Bookmarks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            All virtual servers as bookmarks — organize with categories, tags, and notes
          </Typography>
        </Box>
      </Box>

      <RaList
        title={" "}
        perPage={200}
        pagination={<MyPagination />}
        sort={{ field: "title", order: "ASC" }}
        empty={<Empty resource={"bookmarks"} />}
        sx={{
          "& .RaList-main": { boxShadow: "none" },
          "& .RaList-content": {
            boxShadow: "none",
            backgroundColor: "transparent",
          },
          "& .RaList-actions": { mb: 0, minHeight: 0, pt: 0 },
        }}
        actions={false}
      >
        <BookmarkGrid />
      </RaList>
    </Box>
  );
};

export default List;
