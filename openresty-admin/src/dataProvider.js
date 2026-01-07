import { isEmpty } from "lodash";
import { useStore, useNotify } from "react-admin";
const getHeaders = () => {
  const token = localStorage.getItem("token");
  const accessToken = JSON.parse(token);

  const basicHeaders = {
    // Accept: "application/json",
    // "Content-Type": "application/json",
    "x-platform": "react-admin",
  };

  if (accessToken?.accessToken) {
    basicHeaders.Authorization = `Bearer ${accessToken.accessToken}`;
  }
  return basicHeaders;
};

// Helper function to generate SSL configuration block for nginx
// Uses auto_ssl for dynamic Let's Encrypt certificate management
const generateSslConfigBlock = (data) => {
  if (!data?.ssl_enabled) return "";

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

// Helper function to generate ACME challenge location block
// Uses auto_ssl:challenge_server() which is the correct method for lua-resty-auto-ssl
const generateAcmeChallengeBlock = (data) => {
  if (!data?.ssl_enabled) return "";

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
const generateHttpsRedirectServerBlock = (data) => {
  if (!data?.ssl_enabled || !data?.ssl_force_https) return "";

  const serverName = data.server_name || "example.com";

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

const handleConfigField = (data) => {
  data.config = `${generateHttpsRedirectServerBlock(data)}server {
      ${
        data?.listens?.length
          ? data?.listens
              .map((listen) => {
                return `listen ${listen.listen || ""};`;
              })
              .join("\n")
          : ""
      }  # Listen on port (HTTP)
      ${generateSslConfigBlock(data)}
      server_name ${data.server_name || "example.com"};  # Your domain name
      root ${data.root || "/var/www/html"};  # Document root directory
      index ${data.index || "index.html index.htm"};  # Default index files
      access_log ${
        data.access_log || "/var/log/nginx/access.log"
      };  # Access log file location
      error_log ${
        data.error_log || "/var/log/nginx/error.log"
      };  # Error log file location
      ${generateAcmeChallengeBlock(data)}
      ${
        data?.locations?.length
          ? data.locations
              .map((location) => {
                return `location ${location?.location_path || "/"} {
                ${
                  location?.location_vals
                    ? Object.values(location?.location_opts)
                        .map((idx) => {
                          const value = location?.location_vals[idx];
                          return idx + " " + value;
                        })
                        .join("\n")
                    : "#Please select an Options"
                }
            ${
              !isEmpty(data?.custom_location_block)
                ? data?.custom_location_block
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
          ? data?.custom_block.map((block) => block.additional_block).join("\n")
          : ""
      }
  }
  ${
    !isEmpty(data?.custom_http_block)
      ? data?.custom_http_block
          .map((block) => block.additional_http_block)
          .join("\n")
      : ""
  }
  `;
  return data;
};
const dataProvider = (apiUrl, settings = {}) => {
  const [isLoading, setIsLoadig] = useStore("fetch.data.loading", false);
  const [syncPopupOpen, setSyncPopupOpen] = useStore(
    "sync.data.success",
    false
  );
  const [secretTags, setSecretTags] = useStore("secret.data.tags", []);
  const notify = useNotify();
  return {
    get: async (resource, params) => {
      setIsLoadig(true);
      params.timestamp = Date.now();
      const url = `${apiUrl}/resource?_format=json&params=${JSON.stringify(
        params
      )}`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      const { data } = await response.json();
      setIsLoadig(false);
      return { data };
    },
    getList: async (resource, params) => {
      setIsLoadig(true);
      try {
        const environmentProfile =
          localStorage.getItem("environment") || "prod";
        if (!params.filter?.profile_id && environmentProfile) {
          params.filter.profile_id = environmentProfile;
        }
        params.timestamp = Date.now();
        const url = `${apiUrl}/${resource}?_format=json&params=${JSON.stringify(
          params
        )}`;
        const response = await fetch(url, {
          method: "GET",
          headers: getHeaders(),
        });

        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        setIsLoadig(false);
        return isEmpty(data.data)
          ? Promise.resolve({ data: [], total: 0 })
          : data;
      } catch (error) {
        console.warn({ error });
        setIsLoadig(false);
      }
    },
    getOne: async (resource, params) => {
      setIsLoadig(true);
      const environmentProfile = localStorage.getItem("environment") || "prod";
      const { id } = params;
      const timestamp = Date.now();
      const url = `${apiUrl}/${resource}/${id}?_format=json&envprofile=${
        environmentProfile || ""
      }&timestamp=${timestamp}`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      if (response.status < 200 && response.status !== 401) {
        return Promise.reject(data.error);
      }
      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("uuid_business_id");
        window.location.href = "/#/login";
      }
      const data = await response.json();

      localStorage.setItem(
        `${resource}.tags`,
        JSON.stringify(data.data[`${resource}_tags`])
      );

      setIsLoadig(false);
      return data;
    },
    getMany: async (resource, params) => {
      setIsLoadig(true);
      const url = `${apiUrl}/${resource}?filter=${JSON.stringify(params)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      if (response.status < 200 && response.status !== 401) {
        return Promise.reject(data.error);
      }
      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("uuid_business_id");
        window.location.href = "/#/login";
      }
      const data = await response.json();
      setIsLoadig(false);
      return data;
    },
    create: async (resource, params) => {
      setIsLoadig(true);
      const url = `${apiUrl}/${resource}`;
      let { data } = params;
      if (resource === "servers") {
        data = handleConfigField(data);
      }
      data = JSON.stringify(data);
      data = data
        .replace("&", "\\u0026")
        .replaceAll("+", "\\u002B")
        .replaceAll("=", "\\u003D");
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: getHeaders(),
          body: data,
        });
        if (response.status < 200 || response.status >= 300) {
          setIsLoadig(false);
          const responseMessage = await response.json();
          return Promise.reject(responseMessage?.data?.message);
        }
        const result = await response.json();
        setIsLoadig(false);
        return result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false);
      }
    },
    update: async (resource, params) => {
      const environmentProfile = localStorage.getItem("environment");
      setIsLoadig(true);
      let { data } = params;
      const { id } = params;
      const timestamp = Date.now();
      const url = `${apiUrl}/${resource}/${id}?timestamp=${timestamp}`;
      if (resource === "servers") {
        data = handleConfigField(data);
      }
      if (environmentProfile && data.profile_id !== environmentProfile) {
        data.profile_id = environmentProfile;
      }
      data = JSON.stringify(data);
      data = data
        .replace("&", "\\u0026")
        .replaceAll("+", "\\u002B")
        .replaceAll("=", "\\u003D");
      try {
        const response = await fetch(url, {
          method: "PUT",
          body: data,
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300) {
          setIsLoadig(false);
          const responseMessage = await response.json();
          return Promise.reject(responseMessage?.data?.message);
        }
        const result = await response.json();
        setIsLoadig(false);
        return result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false);
      }
    },
    delete: async (resource, params) => {
      setIsLoadig(true);
      const environmentProfile = localStorage.getItem("environment") || "prod";
      const { data } = params;
      const { id } = params;
      params.envProfile = environmentProfile;
      const url = `${apiUrl}/${resource}/${id}`;
      try {
        console.log({ url });
        const response = await fetch(url, {
          method: "DELETE",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const result = await response.json();
        setIsLoadig(false);
        return result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false);
      }
    },
    deleteMany: async (resource, params) => {
      setIsLoadig(true);
      const url = `${apiUrl}/${resource}`;
      params.envProfile = localStorage.getItem("environment") || "prod";
      params.timestamp = Date.now();
      try {
        console.log({ url });
        const response = await fetch(url, {
          method: "DELETE",
          body: JSON.stringify({ ids: params }),
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const result = await response.json();
        setIsLoadig(false);
        return isEmpty(result.data)
          ? Promise.resolve({ data: [], total: 0 })
          : result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false);
      }
    },
    saveStorageFlag: async (resource, params) => {
      try {
        setIsLoadig(true);
        const url = `${apiUrl}/${resource}?_format=json`;
        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        setIsLoadig(false);
        return data;
      } catch (error) {
        console.log({ error });
        setIsLoadig(false);
        throw new Error(error);
      }
    },

    syncAPI: async (resource, params) => {
      const FRONT_URL = import.meta.env.VITE_FRONT_URL;
      try {
        setIsLoadig(true);
        let instance = localStorage.getItem("instance");
        if (instance) {
          instance = JSON.parse(instance);
          const environmentProfile =
            localStorage.getItem("environment") || "prod";
          const url = `${FRONT_URL}/${resource}?envprofile=${
            environmentProfile || ""
          }&settings=true&instance_hash=${
            instance.instance_hash
          }&serial_number=${instance.serial_number}
            `;
          let reqHeaders = getHeaders();
          delete reqHeaders["x-platform"]
          const response = await fetch(url, {
            method: "GET",
            headers: reqHeaders,
          });
          if (response.status === 200) {
            setIsLoadig(false);
            setSyncPopupOpen(true);
          }
        }
        setIsLoadig(false);
      } catch (error) {
        console.log(error);
        setSyncPopupOpen(false);
        setIsLoadig(false);
      }
    },

    importProjects: async (resource, params) => {
      try {
        setIsLoadig(true);
        const environmentProfile =
          localStorage.getItem("environment") || "prod";
        // console.log({params}); return
        // params.envProfile = environmentProfile;
        const url = `${apiUrl}/${resource}?_format=json`;
        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        setIsLoadig(false);
        return data;
      } catch (error) {
        console.log({ error });
        setIsLoadig(false);
        throw new Error(error);
      }
    },

    profileUpdate: async (resource, params) => {
      const FRONT_URL = import.meta.env.VITE_FRONT_URL;
      params.timestamp = Date.now();
      try {
        setIsLoadig(true);
        const url = `${apiUrl}/${resource}`;
        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        setIsLoadig(false);
        window.location.reload();
        return data;
      } catch (error) {
        console.log(error);
        setSyncPopupOpen(false);
        setIsLoadig(false);
      }
    },

    loadSettings: async (resource, params) => {
      try {
        setIsLoadig(true);
        const timestamp = Date.now();
        const url = `${apiUrl}/${resource}?timestamp=${timestamp}`;
        const response = await fetch(url, {
          method: "GET",
          headers: getHeaders(),
        });
        if (response.status === 200) {
          setIsLoadig(false);
          const data = await response.json();
          return data;
        }
        setIsLoadig(false);
      } catch (error) {
        console.log(error);
        setIsLoadig(false);
      }
    },

    getLogs: async (resource, params) => {
      try {
        setIsLoadig(true);
        const timestamp = Date.now();
        const url = `${apiUrl}/${resource}?timestamp=${timestamp}`;
        const response = await fetch(url, {
          method: "GET",
          headers: getHeaders(),
        });
        const data = await response.json();
        if (response.status < 200 && response.status !== 401) {
          setIsLoadig(false);
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          setIsLoadig(false);
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        if (response.status === 200) {
          setIsLoadig(false);
          return data;
        }
        setIsLoadig(false);
      } catch (error) {
        console.log(error);
        setIsLoadig(false);
      }
    },

    checkORStatus: async (resource, params) => {
      try {
        setIsLoadig(true);
        const timestamp = Date.now();
        const url = `${apiUrl}/${resource}?timestamp=${timestamp}`;
        const response = await fetch(url, {
          method: "GET",
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        if (response.status === 200) {
          setIsLoadig(false);
          const result = await response.json();
          if (result?.data?.message) {
            return Promise.resolve(result?.data);
          }
        }
        setIsLoadig(false);
      } catch (error) {
        console.log(error);
        setIsLoadig(false);
      }
    },

    pushDataServers: async (resource, params) => {
      params.timestamp = Date.now();
      const environmentProfile = localStorage.getItem("environment") || "prod";
      params.profile = environmentProfile;

      try {
        setIsLoadig(true);
        const url = `${apiUrl}/${resource}`;
        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        setIsLoadig(false);
        return data;
      } catch (error) {
        console.log(error);
        setSyncPopupOpen(false);
        setIsLoadig(false);
      }
    },

    resetPassword: async (resource, params) => {
      params.timestamp = Date.now();
      try {
        setIsLoadig(true);
        const url = `${apiUrl}/${resource}`;
        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 && response.status !== 401) {
          return Promise.reject(data.error);
        }
        if (response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        setIsLoadig(false);
        return data;
      } catch (error) {
        console.log(error);
        setSyncPopupOpen(false);
        setIsLoadig(false);
      }
    },
  };
};
export default dataProvider;
