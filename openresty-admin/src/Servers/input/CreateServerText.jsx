import React from "react";
import { TextInput, FormDataConsumer, BooleanInput } from "react-admin";
import { Grid } from "@mui/material";
import { isEmpty } from "lodash";

// Helper function to generate SSL configuration block
// Uses auto_ssl for dynamic Let's Encrypt certificate management
const generateSslConfig = (formData) => {
  if (!formData?.ssl_enabled) return "";

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

// Helper function to generate ACME challenge location
// Uses auto_ssl:challenge_server() which is the correct method for lua-resty-auto-ssl
const generateAcmeChallengeLocation = (formData) => {
  if (!formData?.ssl_enabled) return "";

  return `
    # ACME Challenge for Let's Encrypt (lua-resty-auto-ssl)
    location /.well-known/acme-challenge/ {
        content_by_lua_block {
            auto_ssl:challenge_server()
        }
    }`;
};

// Helper function to generate HTTP to HTTPS redirect server block
// Uses auto_ssl:challenge_server() which is the correct method for lua-resty-auto-ssl
const generateHttpsRedirectBlock = (formData) => {
  if (!formData?.ssl_enabled || !formData?.ssl_force_https) return "";

  const serverName = formData.server_name || "example.com";

  return `
# HTTP to HTTPS redirect
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

const CreateServerText = ({ source }) => {
  return (
    <FormDataConsumer>
      {({ formData, ...rest }) => (
        <Grid item xs={12}>
          <TextInput
            multiline
            source={source}
            label="Generated Nginx Server Config"
            helperText="For example: server {listen       8000; listen       somename:8080; server_name  somename  alias  another.alias; location / { root   html; index  index.html index.htm; }}"
            fullWidth
            format={() => `${generateHttpsRedirectBlock(formData)}server {
            ${formData?.listens?.length
                ? formData?.listens
                  .map((listen) => {
                    return `listen ${listen.listen || ""};`;
                  })
                  .join("\n")
                : ""
              }  # Listen on port (HTTP)
            ${generateSslConfig(formData)}
            server_name ${formData.server_name || "example.com"
              };  # Your domain name
            root ${formData.root || "/var/www/html"};  # Document root directory
            index ${formData.index || "index.html index.htm"
              };  # Default index files
            access_log ${formData.access_log || "/var/log/nginx/access.log"
              };  # Access log file location
            error_log ${formData.error_log || "/var/log/nginx/error.log"
              };  # Error log file location
            ${generateAcmeChallengeLocation(formData)}
            ${formData?.locations?.length
                ? formData.locations
                  .map((location) => {
                    return `location ${location?.location_path || "/"} {
                      ${location?.location_vals
                        ? Object.values(location?.location_opts)
                          .map((idx) => {
                            const value = location?.location_vals[idx];
                            return idx + " " + value;
                          })
                          .join("\n")
                        : "#Please select an Options"
                      }
                        ${!isEmpty(formData?.custom_location_block)
                          ? formData?.custom_location_block
                          .map((block) => block.additional_location_block)
                          .join("\n")
                          : ""
                        }
                      }`;
                  })
                  .join("\n")
                : ""
              }
              ${!isEmpty(formData?.custom_block)
                ? formData?.custom_block
                  .map((block) => block.additional_block)
                  .join("\n")
                : ""
              }
            }
            ${!isEmpty(formData?.custom_http_block)
              ? formData?.custom_http_block
              .map((block) => block.additional_http_block)
              .join("\n")
              : ""
            }
          `}
          />
          <BooleanInput
            source="config_status"
            label="Active"
            fullWidth
            defaultValue={false}
          />
        </Grid>
      )}
    </FormDataConsumer>
  );
};

export default CreateServerText;
