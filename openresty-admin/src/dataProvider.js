import { isEmpty } from "lodash";
const getHeaders = () => {
    const token = localStorage.getItem("token");
    const accessToken = JSON.parse(token);
  
    const basicHeaders = {
      // Accept: "application/json",
      // "Content-Type": "application/json",
    };
  
    if (accessToken?.accessToken) {
      basicHeaders.Authorization = `Bearer ${accessToken.accessToken}`;
    }
    return basicHeaders;
  };

  const handleConfigField = (data) => {
    data.config = `server {
      ${
        data?.listens?.length
          ? data?.listens
              .map((listen) => {
                return `listen ${listen.listen || ""};`;
              })
              .join("\n")
          : ""
      }  # Listen on port (HTTP)
      server_name ${
        data.server_name || "example.com"
      };  # Your domain name
      root ${data.root || "/var/www/html"};  # Document root directory
      index ${
        data.index || "index.html index.htm"
      };  # Default index files
      access_log ${
        data.access_log || "/var/log/nginx/access.log"
      };  # Access log file location
      error_log ${
        data.error_log || "/var/log/nginx/error.log"
      };  # Error log file location

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
                }`;
              })
              .join("\n")
          : ""
      }
      ${
        !isEmpty(data?.custom_block)
          ? data?.custom_block
              .map((block) => block.additional_block)
              .join("\n")
          : ""
      }
  }
  `;
  return data;
  }
  const dataProvider = (apiUrl, settings = {}) => ({
    get: async (resource, params) => {
      const url = `${apiUrl}/resource?_format=json&params=${JSON.stringify(
        params
      )}`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      const { data } = await response.json();
      return { data };
    },
    getList: async (resource, params) => {
      try {
        const url = `${apiUrl}/${resource}?_format=json&params=${JSON.stringify(
          params
        )}`;
        const response = await fetch(url, {
          method: "GET",
          headers: getHeaders(),
        });
  
        if (response.status < 200 || response.status >= 300 && response.status !== 409 && response.status !== 404) {
          localStorage.removeItem("token");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        return isEmpty(data.data) ? Promise.resolve({ data: [], total: 0 }) : data;
      } catch (error) {
        console.warn({ error });
      }
    },
    getOne: async (resource, params) => {
      const { id } = params;
      const url = `${apiUrl}/${resource}/${id}?_format=json`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      if (response.status < 200 || response.status >= 300 && response.status !== 409) {
        localStorage.removeItem("token");
        localStorage.removeItem("uuid_business_id");
        window.location.href = "/#/login";
      }
      const data = await response.json();
      return data;
    },
    getMany: async (resource, params) => {
      const url = `${apiUrl}/${resource}?filter=${JSON.stringify(params)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      if (response.status < 200 || response.status >= 300 && response.status !== 409) {
        localStorage.removeItem("token");
        localStorage.removeItem("uuid_business_id");
        window.location.href = "/#/login";
      }
      const data = await response.json();
      return data;
    },
    create: async (resource, params) => {
      const url = `${apiUrl}/${resource}`;
      let { data } = params;
      if (resource === "servers") {
        data = handleConfigField(data)
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(data),
        });
        if (response.status < 200 || response.status >= 300) {
          const responseMessage = await response.json();
          return Promise.reject(responseMessage?.data?.message);
        }
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Error:", error);
      }
    },
    update: async (resource, params) => {
      let { data } = params;
      const { id } = params;
      const url = `${apiUrl}/${resource}/${id}`;
      if (resource === "servers") {
        data = handleConfigField(data)
      }
      try {
        const response = await fetch(url, {
          method: "PUT",
          body: JSON.stringify(data),
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300) {
          const responseMessage = await response.json();
          return Promise.reject(responseMessage?.data?.message);
        }
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Error:", error);
      }
    },
    delete: async (resource, params) => {
      const { data } = params;
      const { id } = params;
      const url = `${apiUrl}/${resource}/${id}`;
      try {
        console.log({url});
        const response = await fetch(url, {
          method: "DELETE",
          body: JSON.stringify(data),
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300 && response.status !== 409) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Error:", error);
      }
    },
    deleteMany: async (resource, params) => {
      const url = `${apiUrl}/${resource}`;

      try {
        console.log({url});
        const response = await fetch(url, {
          method: "DELETE",
          body: JSON.stringify({ ids: params.ids }),
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300 && response.status !== 409) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const result = await response.json();
        return isEmpty(result.data) ? Promise.resolve({ data: [], total: 0 }) : result;
      } catch (error) {
        console.error("Error:", error);
      }
    },
    saveStorageFlag: async (resource, params) => {
      try {
        const url = `${apiUrl}/${resource}?_format=json`;
        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300 && response.status !== 409) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        return data;
      } catch (error) {
        console.log({ error });
        throw new Error(error);
      }
    },
  });
  export default dataProvider;