/* ──────────────────────────────────────────────────────────────────────────
   Compose the nginx server block from ServerFormState.

   Ported from openresty-admin/src/Servers/input/CreateServerText.jsx and
   openresty-admin/src/dataProvider.js:handleConfigField().  Same output
   shape as the old dashboard so a server saved from either UI writes
   byte-identical config on disk.

   Contract:
     - Runs on every render of the preview and on save.  Pure function of
       ServerFormState — no side effects.
     - Empty / missing fields render as the same placeholders the old
       form used ("example.com", "/var/www/html", etc.) so the operator
       can see what the default output will be.
     - HTML/HTTPS split emits the redirect block ONLY when SSL is
       enabled AND ssl_force_https is on.  Same rule as the old form.

   NOT here:
     - Base64 encoding.  The BACKEND base64-encodes `.config` in
       api.lua:CreateUpdateRecord — the frontend always deals in
       plaintext.  If you see base64 in the preview, something upstream
       is passing the stored value through untouched instead of
       regenerating with this helper.
   ────────────────────────────────────────────────────────────────────────── */

import type { ServerFormState } from "../types";

/* ── Section builders ──────────────────────────────────────────────────── */

const generateSslConfig = (form: ServerFormState): string => {
  if (!form.ssl_enabled) return "";

  return `
    # SSL Configuration (managed by auto_ssl / Let's Encrypt)
    listen 443 ssl http2;

    # Dynamic SSL certificate via auto_ssl
    ssl_certificate_by_lua_block {
        auto_ssl:ssl_certificate()
    }

    # Fallback certificate (required for nginx validation)
    ssl_certificate /etc/ssl/resty-auto-ssl-fallback.crt;
    ssl_certificate_key /etc/ssl/resty-auto-ssl-fallback.key;

    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS - Force HTTPS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`;
};

const generateAcmeChallengeLocation = (form: ServerFormState): string => {
  if (!form.ssl_enabled) return "";

  return `
    # ACME Challenge for Let's Encrypt (lua-resty-auto-ssl)
    location /.well-known/acme-challenge/ {
        content_by_lua_block {
            auto_ssl:challenge_server()
        }
    }`;
};

const generateHttpsRedirectBlock = (form: ServerFormState): string => {
  // Only when SSL is on AND the operator asked for HTTPS-force.  Match
  // the old form's conjunction so behaviour is identical.
  if (!form.ssl_enabled || !form.ssl_force_https) return "";

  const serverName = form.server_name || "example.com";

  return `# HTTP to HTTPS redirect
server {
    listen 80;
    server_name ${serverName};

    # ACME Challenge for Let's Encrypt (lua-resty-auto-ssl)
    location /.well-known/acme-challenge/ {
        content_by_lua_block {
            auto_ssl:challenge_server()
        }
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

`;
};

const isEmptyArray = <T>(arr: T[] | undefined | null): boolean =>
  !arr || arr.length === 0;

const generateLocationBlocks = (form: ServerFormState): string => {
  if (isEmptyArray(form.locations)) return "";

  return form.locations
    .map((location) => {
      const path = location?.location_path || "/";
      const optsEntries: [string, unknown][] = Object.entries(
        location?.location_opts ?? {},
      );
      const vals = (location?.location_vals ?? {}) as Record<string, string>;
      const directives =
        optsEntries.length > 0
          ? optsEntries
              .map(([, directive]) => {
                const key = String(directive);
                const value = vals[key] ?? "";
                return `    ${key} ${value};`;
              })
              .join("\n")
          : "    # Please select an Options";

      const perLocationCustom = isEmptyArray(form.custom_location_block)
        ? ""
        : form.custom_location_block
            .map((b) => b.additional_location_block)
            .filter((s) => s && s.trim().length > 0)
            .join("\n    ");

      return `    location ${path} {
${directives}${perLocationCustom ? `\n    ${perLocationCustom}` : ""}
    }`;
    })
    .join("\n");
};

const generateCustomBlocks = (form: ServerFormState): string => {
  if (isEmptyArray(form.custom_block)) return "";
  return form.custom_block
    .map((b) => b.additional_block)
    .filter((s) => s && s.trim().length > 0)
    .map((s) => `    ${s}`)
    .join("\n");
};

const generateCustomHttpBlocks = (form: ServerFormState): string => {
  if (isEmptyArray(form.custom_http_block)) return "";
  return form.custom_http_block
    .map((b) => b.additional_http_block)
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n");
};

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Compose the complete nginx server block for this server.  Called every
 * render of the preview so the operator sees exactly what will be
 * written on save.
 */
export function generateNginxServerConfig(form: ServerFormState): string {
  const listens =
    form.listens && form.listens.length > 0
      ? form.listens.map((l) => `    listen ${l.listen || ""};`).join("\n")
      : "";

  const serverBlock = `server {
${listens}  # Listen on port (HTTP)
${generateSslConfig(form)}
    server_name ${form.server_name || "example.com"};  # Your domain name
    root ${form.root || "/var/www/html"};  # Document root directory
    index ${form.index || "index.html index.htm"};  # Default index files
    access_log ${form.access_log || "/var/log/nginx/access.log"};  # Access log file location
    error_log ${form.error_log || "/var/log/nginx/error.log"};  # Error log file location
${generateAcmeChallengeLocation(form)}
${generateLocationBlocks(form)}
${generateCustomBlocks(form)}
}
${generateCustomHttpBlocks(form)}`;

  return `${generateHttpsRedirectBlock(form)}${serverBlock}`;
}
