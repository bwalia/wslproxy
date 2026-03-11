import React from "react";
import {
  ArrayInput,
  SimpleFormIterator,
  TextInput,
  SelectInput,
  BooleanInput,
} from "react-admin";
import { Typography } from "@mui/material";

const VCL_HOOK_CHOICES = [
  { id: "vcl_recv", name: "vcl_recv - Request received" },
  { id: "vcl_hash", name: "vcl_hash - Build cache key" },
  { id: "vcl_hit", name: "vcl_hit - Cache hit" },
  { id: "vcl_miss", name: "vcl_miss - Cache miss" },
  { id: "vcl_backend_fetch", name: "vcl_backend_fetch - Before backend fetch" },
  {
    id: "vcl_backend_response",
    name: "vcl_backend_response - Backend response received",
  },
  { id: "vcl_deliver", name: "vcl_deliver - Before delivering to client" },
  { id: "vcl_synth", name: "vcl_synth - Synthetic response" },
  { id: "vcl_init", name: "vcl_init - Initialization" },
];

const VarnishSnippetEditor = () => (
  <>
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ mb: 2 }}
    >
      VCL snippets are injected into the generated Varnish configuration at the
      specified hook points. Snippets are ordered by priority (lower values run
      first).
    </Typography>
    <ArrayInput source="varnish_snippets" label="">
      <SimpleFormIterator
        inline={false}
        disableReordering={false}
        getItemLabel={(index) => `Snippet #${index + 1}`}
      >
        <TextInput source="name" label="Snippet Name" fullWidth />
        <BooleanInput
          source="enabled"
          label="Enabled"
          defaultValue={true}
        />
        <TextInput
          source="priority"
          label="Priority (lower = first)"
          defaultValue="100"
          sx={{ width: 180 }}
        />
        <SelectInput
          source="hook_point"
          label="Hook Point"
          choices={VCL_HOOK_CHOICES}
          sx={{ minWidth: 300 }}
        />
        <TextInput
          multiline
          fullWidth
          source="content"
          label="VCL Code"
          className="code_area"
          minRows={4}
          placeholder={`# Example: Strip marketing cookies\nif (req.http.Cookie) {\n    set req.http.Cookie = regsuball(req.http.Cookie, "(^|;\\s*)(__utm[a-z]+|_ga|_gid)=[^;]*", "");\n}`}
        />
      </SimpleFormIterator>
    </ArrayInput>
  </>
);

export default VarnishSnippetEditor;
