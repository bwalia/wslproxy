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
  
        if (response.status < 200 || response.status >= 300 && response.status !== 404) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/#/login";
        }
        const data = await response.json();
        return data;
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
      if (response.status < 200 || response.status >= 300) {
        localStorage.removeItem("token");
        localStorage.removeItem("uuid_business_id");
        window.location.href = "/login";
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
      if (response.status < 200 || response.status >= 300) {
        localStorage.removeItem("token");
        localStorage.removeItem("uuid_business_id");
        window.location.href = "/login";
      }
      const data = await response.json();
      return data;
    },
    create: async (resource, params) => {
      const url = `${apiUrl}/${resource}`;
      const { data } = params;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(data),
        });
        if (response.status < 200 || response.status >= 300) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/login";
        }
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Error:", error);
      }
    },
    update: async (resource, params) => {
      const { data } = params;
      const { id } = params;
      const url = `${apiUrl}/${resource}/${id}`;
      try {
        console.log({url});
        const response = await fetch(url, {
          method: "PUT",
          body: JSON.stringify(data),
          headers: getHeaders(),
        });
        if (response.status < 200 || response.status >= 300) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/login";
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
        if (response.status < 200 || response.status >= 300) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/login";
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
        if (response.status < 200 || response.status >= 300) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/login";
        }
        const result = await response.json();
        return result;
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
        if (response.status < 200 || response.status >= 300) {
          localStorage.removeItem("token");
          localStorage.removeItem("uuid_business_id");
          window.location.href = "/login";
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