import React from "react";
import {
  SimpleForm,
  TextInput,
  BooleanInput,
  required,
  SaveButton,
  Toolbar,
} from "react-admin";
import { Box, Typography, useTheme, alpha, Divider } from "@mui/material";
import BookmarkIcon from "@mui/icons-material/BookmarkRounded";

const BookmarkToolbar = (props) => (
  <Toolbar {...props}>
    <SaveButton label="Save Bookmark" />
  </Toolbar>
);

const Form = ({ type }) => {
  const theme = useTheme();

  return (
    <SimpleForm toolbar={<BookmarkToolbar />}>
      <Box sx={{ width: "100%", maxWidth: 700 }}>
        {/* Header */}
        <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
            }}
          >
            <BookmarkIcon sx={{ fontSize: 20 }} />
          </Box>
          <Typography variant="h6" fontWeight={600}>
            {type === "edit" ? "Edit Bookmark" : "Create Bookmark"}
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Core Fields */}
        <TextInput
          source="title"
          label="Title"
          fullWidth
          validate={required()}
          helperText="Display name for the bookmark"
        />
        <TextInput
          source="host"
          label="Host"
          fullWidth
          validate={required()}
          helperText="Server hostname (e.g. api.example.com)"
          disabled={type === "edit"}
        />
        <TextInput
          source="url"
          label="URL"
          fullWidth
          helperText="Full URL to open when clicking the bookmark"
        />

        <Divider sx={{ my: 3 }} />

        {/* Organization */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Organization
        </Typography>
        <TextInput
          source="category"
          label="Category"
          fullWidth
          helperText="Group bookmarks by category (e.g. Production APIs, Dev Tools)"
        />
        <TextInput
          source="tags"
          label="Tags"
          fullWidth
          format={(v) => (Array.isArray(v) ? v.join(", ") : v || "")}
          parse={(v) =>
            v
              ? v
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
              : []
          }
          helperText="Comma-separated tags (e.g. production, api, critical)"
        />
        <TextInput
          source="description"
          label="Description"
          fullWidth
          multiline
          rows={3}
          helperText="Optional notes about this server"
        />

        <Divider sx={{ my: 3 }} />

        {/* Read-only metadata */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Server Info
        </Typography>
        <TextInput source="profile_id" label="Profile" fullWidth disabled />
        <TextInput source="proxy_pass" label="Proxy Pass" fullWidth disabled />
        <BooleanInput source="ssl_enabled" label="SSL Enabled" disabled />
      </Box>
    </SimpleForm>
  );
};

export default Form;
