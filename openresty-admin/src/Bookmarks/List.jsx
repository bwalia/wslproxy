import React from "react";
import {
  Datagrid,
  List as RaList,
  TextField,
  SearchInput,
  FunctionField,
  useDataProvider,
  useNotify,
  useRefresh,
} from "react-admin";
import {
  Box,
  Chip,
  Typography,
  useTheme,
  alpha,
  Link as MuiLink,
  IconButton,
  Tooltip,
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/BookmarkRounded";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorderRounded";
import LaunchIcon from "@mui/icons-material/LaunchRounded";
import LockIcon from "@mui/icons-material/LockRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesomeRounded";
import StarIcon from "@mui/icons-material/StarRounded";
import Empty from "../component/Empty";
import { MyPagination } from "../component/MyPagination";

const bookmarkFilters = [
  <SearchInput
    source="q"
    alwaysOn
    fullWidth
    placeholder="Search bookmarks by host, title, or description..."
    sx={{
      "& .MuiOutlinedInput-root": {
        borderRadius: 2,
      },
    }}
  />,
];

// Bookmark type indicator
const TypeChip = () => {
  const theme = useTheme();

  return (
    <FunctionField
      source="auto_generated"
      label="Type"
      render={(record) => (
        <Chip
          icon={record.auto_generated ? <AutoAwesomeIcon /> : <StarIcon />}
          label={record.auto_generated ? "Auto" : "Saved"}
          size="small"
          sx={{
            backgroundColor: record.auto_generated
              ? alpha(theme.palette.grey[500], 0.12)
              : alpha(theme.palette.primary.main, 0.12),
            color: record.auto_generated
              ? theme.palette.text.secondary
              : theme.palette.primary.main,
            fontWeight: 500,
            fontSize: "0.75rem",
            "& .MuiChip-icon": {
              fontSize: 14,
              color: "inherit",
            },
          }}
        />
      )}
    />
  );
};

// Host link with icon
const HostLinkField = () => {
  const theme = useTheme();

  return (
    <FunctionField
      source="host"
      label="Host"
      render={(record) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {record.auto_generated ? (
            <BookmarkBorderIcon
              sx={{
                fontSize: 18,
                color: theme.palette.text.disabled,
              }}
            />
          ) : (
            <BookmarkIcon
              sx={{
                fontSize: 18,
                color: theme.palette.primary.main,
              }}
            />
          )}
          <MuiLink
            href={record.url || `https://${record.host}`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: record.auto_generated
                ? theme.palette.text.secondary
                : theme.palette.primary.main,
              textDecoration: "none",
              fontWeight: record.auto_generated ? 400 : 500,
              "&:hover": {
                textDecoration: "underline",
              },
            }}
          >
            {record.host}
          </MuiLink>
          <Tooltip title="Open in new tab">
            <IconButton
              size="small"
              href={record.url || `https://${record.host}`}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ ml: 0.5, opacity: 0.5, "&:hover": { opacity: 1 } }}
            >
              <LaunchIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    />
  );
};

// Tags display
const TagsField = () => {
  const theme = useTheme();

  return (
    <FunctionField
      source="tags"
      label="Tags"
      render={(record) => {
        const tags = record.tags || [];
        if (tags.length === 0) return <Typography variant="caption" color="text.disabled">-</Typography>;
        return (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {tags.map((tag, idx) => (
              <Chip
                key={idx}
                label={tag}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: "0.7rem",
                  height: 22,
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                  color: theme.palette.primary.main,
                }}
              />
            ))}
          </Box>
        );
      }}
    />
  );
};

// Promote button for auto-generated bookmarks
const PromoteButton = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const theme = useTheme();

  const handlePromote = async (e, record) => {
    e.stopPropagation();
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

  return (
    <FunctionField
      label=""
      render={(record) =>
        record.auto_generated ? (
          <Tooltip title="Promote to saved bookmark">
            <IconButton
              size="small"
              onClick={(e) => handlePromote(e, record)}
              sx={{
                color: theme.palette.text.secondary,
                "&:hover": { color: theme.palette.primary.main },
              }}
            >
              <StarIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ) : null
      }
    />
  );
};

const List = () => {
  const theme = useTheme();

  return (
    <Box sx={{ pt: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            color: theme.palette.primary.main,
          }}
        >
          <BookmarkIcon sx={{ fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            Bookmarks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            All virtual servers as bookmarks — customize with tags, categories, and notes
          </Typography>
        </Box>
      </Box>

      <RaList
        title={" "}
        perPage={100}
        pagination={<MyPagination />}
        sort={{ field: "title", order: "ASC" }}
        empty={<Empty resource={"bookmarks"} />}
        filters={bookmarkFilters}
        sx={{
          "& .RaList-main": { boxShadow: "none" },
          "& .RaList-content": {
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: "none",
            overflow: "hidden",
          },
        }}
      >
        <Datagrid
          rowClick="edit"
          sx={{
            "& .RaDatagrid-headerCell": {
              fontWeight: 600,
              fontSize: "0.8125rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              backgroundColor:
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.background.paper, 0.5)
                  : theme.palette.grey[50],
              borderBottom: `2px solid ${theme.palette.divider}`,
              py: 2,
            },
            "& .RaDatagrid-row": {
              cursor: "pointer",
              transition: "background-color 0.15s ease",
              "&:hover": {
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
              },
            },
            "& .RaDatagrid-rowCell": {
              py: 1.5,
              borderBottom: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          <TypeChip />
          <HostLinkField />
          <TextField source="category" label="Category" emptyText="-" />
          <TagsField />
          <TextField source="profile_id" label="Profile" />
          <FunctionField
            source="ssl_enabled"
            label="SSL"
            render={(record) => (
              <Chip
                icon={<LockIcon />}
                label={record.ssl_enabled ? "Secure" : "No SSL"}
                size="small"
                sx={{
                  backgroundColor: record.ssl_enabled
                    ? alpha(theme.palette.success.main, 0.12)
                    : alpha(theme.palette.warning.main, 0.12),
                  color: record.ssl_enabled
                    ? theme.palette.success.main
                    : theme.palette.warning.main,
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  "& .MuiChip-icon": { fontSize: 14, color: "inherit" },
                }}
              />
            )}
          />
          <PromoteButton />
        </Datagrid>
      </RaList>
    </Box>
  );
};

export default List;
