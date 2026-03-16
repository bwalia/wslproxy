// Nginx config generation utilities extracted from dataProvider
// Generates nginx server block configuration from Server resource data

import { isEmpty } from "lodash";
import type { Server } from "@/types/resources";

export const generateSslConfigBlock = (data: Partial<Server>): string => {
  if (!data?.ssl_enabled) return "";
  return `
      # SSL Configuration (managed by auto_ssl / Let's Encrypt)
      listen 443 ssl http2;
      ssl_certificate_by_lua_block { auto_ssl:ssl_certificate() }
      ssl_certificate /etc/ssl/resty-auto-ssl-fallback.crt;
      ssl_certificate_key /etc/ssl/resty-auto-ssl-fallback.key;
      ssl_session_timeout 1d;
      ssl_session_cache shared:SSL:50m;
      ssl_session_tickets off;
      ssl_protocols TLSv1.2 TLSv1.3;
      ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
      ssl_prefer_server_ciphers off;
      add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`;
};

export const generateAcmeChallengeBlock = (data: Partial<Server>): string => {
  if (!data?.ssl_enabled) return "";
  return `
      location /.well-known/acme-challenge/ {
          content_by_lua_block { auto_ssl:challenge_server() }
      }`;
};

export const generateHttpsRedirectServerBlock = (
  data: Partial<Server>
): string => {
  if (!data?.ssl_enabled || !data?.ssl_force_https) return "";
  const serverName = data.server_name || "example.com";
  return `
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name ${serverName};
    location /.well-known/acme-challenge/ {
        content_by_lua_block { auto_ssl:challenge_server() }
    }
    location / { return 301 https://$host$request_uri; }
}
`;
};

export const handleConfigField = (data: Server): Server => {
  data.config = `${generateHttpsRedirectServerBlock(data)}server {
      ${data?.listens?.length ? data.listens.map((listen) => `listen ${listen.listen || ""};`).join("\n") : ""}  # Listen on port (HTTP)
      ${generateSslConfigBlock(data)}
      server_name ${data.server_name || "example.com"};  # Your domain name
      root ${data.root || "/var/www/html"};  # Document root directory
      index ${data.index || "index.html index.htm"};  # Default index files
      access_log ${data.access_log || "/var/log/nginx/access.log"};  # Access log file location
      error_log ${data.error_log || "/var/log/nginx/error.log"};  # Error log file location
      ${generateAcmeChallengeBlock(data)}
      ${
        data?.locations?.length
          ? data.locations
              .map((location) => {
                return `location ${location?.location_path || "/"} {
                ${
                  location?.location_vals
                    ? Object.values(location?.location_opts || {})
                        .map((idx) => {
                          const value =
                            location?.location_vals?.[
                              idx as keyof typeof location.location_vals
                            ];
                          return idx + " " + value;
                        })
                        .join("\n")
                    : "#Please select an Options"
                }
            ${
              !isEmpty(data?.custom_location_block)
                ? data.custom_location_block!
                    .map((block) => block.additional_location_block)
                    .join("\n")
                : ""
            }
          }`;
              })
              .join("\n")
          : ""
      }
      ${
        !isEmpty(data?.custom_block)
          ? data.custom_block!
              .map((block) => block.additional_block)
              .join("\n")
          : ""
      }
  }
  ${
    !isEmpty(data?.custom_http_block)
      ? data.custom_http_block!
          .map((block) => block.additional_http_block)
          .join("\n")
      : ""
  }
  `;
  return data;
};
