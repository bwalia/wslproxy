import { isEmpty } from "lodash";
import { useStore, useNotify } from "react-admin"
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
      ${data?.listens?.length
      ? data?.listens
        .map((listen) => {
          return `listen ${listen.listen || ""};`;
        })
        .join("\n")
      : ""
    }  # Listen on port (HTTP)
      server_name ${data.server_name || "example.com"
    };  # Your domain name
      root ${data.root || "/var/www/html"};  # Document root directory
      index ${data.index || "index.html index.htm"
    };  # Default index files
      access_log ${data.access_log || "/var/log/nginx/access.log"
    };  # Access log file location
      error_log ${data.error_log || "/var/log/nginx/error.log"
    };  # Error log file location

      ${data?.locations?.length
      ? data.locations
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
                }`;
        })
        .join("\n")
      : ""
    }
      ${!isEmpty(data?.custom_block)
      ? data?.custom_block
        .map((block) => block.additional_block)
        .join("\n")
      : ""
    }
  }
  `;
  return data;
}
const dataProvider = (apiUrl, settings = {}) => {
  const [isLoading, setIsLoadig] = useStore('fetch.data.loading', false);
  const [syncPopupOpen, setSyncPopupOpen] = useStore('sync.data.success', false);
  const notify = useNotify();
  return {
    get: async (resource, params) => {
      setIsLoadig(true)
      const url = `${apiUrl}/resource?_format=json&params=${JSON.stringify(
        params
      )}`;
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      const { data } = await response.json();
      setIsLoadig(false)
      return { data };
    },
    getList: async (resource, params) => {
      setIsLoadig(true)
            try {
        const environmentProfile = localStorage.getItem('environment') || "prod";
        if (isEmpty(params.filter) && environmentProfile) {
          params.filter = {
            profile_id: environmentProfile
          }
        }
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
        setIsLoadig(false)
        return isEmpty(data.data) ? Promise.resolve({ data: [], total: 0 }) : data;
      } catch (error) {
        console.warn({ error });
        setIsLoadig(false)
      }
    },
    getOne: async (resource, params) => {
      setIsLoadig(true)
      const environmentProfile = localStorage.getItem('environment');
      const { id } = params;
      const url = `${apiUrl}/${resource}/${id}?_format=json&envprofile=${environmentProfile || ''}`;
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
      setIsLoadig(false)
      return data;
    },
    getMany: async (resource, params) => {
      setIsLoadig(true)
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
      setIsLoadig(false)
      return data;
    },
    create: async (resource, params) => {
      setIsLoadig(true)
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
        setIsLoadig(false)
        return result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false)
      }
    },
    update: async (resource, params) => {
      setIsLoadig(true)
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
        setIsLoadig(false)
        return result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false)
      }
    },
    delete: async (resource, params) => {
      setIsLoadig(true)
      const environmentProfile = localStorage.getItem('environment') || "";
      const { data } = params;
      const { id } = params;
      params.envProfile = environmentProfile
      const url = `${apiUrl}/${resource}/${id}`;
      try {
        console.log({ url });
        const response = await fetch(url, {
          method: "DELETE",
          body: JSON.stringify(params),
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300 && response.status !== 409) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const result = await response.json();
        setIsLoadig(false)
        return result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false)
      }
    },
    deleteMany: async (resource, params) => {
      setIsLoadig(true)
      const url = `${apiUrl}/${resource}`;
      params.envProfile = localStorage.getItem('environment');
      try {
        console.log({ url });
        const response = await fetch(url, {
          method: "DELETE",
          body: JSON.stringify({ ids: params }),
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300 && response.status !== 409) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const result = await response.json();
        setIsLoadig(false)
        return isEmpty(result.data) ? Promise.resolve({ data: [], total: 0 }) : result;
      } catch (error) {
        console.error("Error:", error);
        setIsLoadig(false)
      }
    },
    saveStorageFlag: async (resource, params) => {
      try {
        setIsLoadig(true)
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
        setIsLoadig(false)
        return data;
      } catch (error) {
        console.log({ error });
        setIsLoadig(false)
        throw new Error(error);
      }
    },

    syncAPI: async (resource, params) => {
      const FRONT_URL = import.meta.env.VITE_FRONT_URL;
      try {
        setIsLoadig(true);
        const environmentProfile = localStorage.getItem('environment');
        const url = `${FRONT_URL}/${resource}?envprofile=${environmentProfile || ''}`;
        const response = await fetch(url, {
          method: "GET",
          headers: getHeaders(),
        });
        if (response.status === 200) {
          setIsLoadig(false);
          setSyncPopupOpen(true);
        }
      } catch (error) {
        console.log(error)
        setSyncPopupOpen(false);
        setIsLoadig(false)
      }
    },

    importProjects: async (resource, params) => {
      try {
        setIsLoadig(true)
        const environmentProfile = localStorage.getItem('environment');
        params.envProfile = environmentProfile;
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
        setIsLoadig(false);
        window.location.reload();
        return data;
      } catch (error) {
        console.log({ error });
        setIsLoadig(false)
        throw new Error(error);
      }
    },

    profileUpdate: async (resource, params) => {
      const FRONT_URL = import.meta.env.VITE_FRONT_URL;
      try {
        setIsLoadig(true)
        const url = `${FRONT_URL}/${resource}`;
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
        setIsLoadig(false);
        window.location.reload();
        return data;
      } catch (error) {
        console.log(error)
        setSyncPopupOpen(false);
        setIsLoadig(false)
      }
    },
  }
};
export default dataProvider;