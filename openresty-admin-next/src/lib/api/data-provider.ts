// Plain module data provider — no React dependencies
// All methods are plain async functions, no hooks or store usage

import { getHeaders, encodeSpecialChars } from '@/lib/api/client';
import { handleConfigField } from '@/lib/nginx/config-generator';
import { config } from '@/lib/config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListParams {
  filter?: Record<string, unknown>;
  pagination?: { page: number; perPage: number };
  sort?: { field: string; order: 'ASC' | 'DESC' };
  timestamp?: number;
  [key: string]: unknown;
}

export interface GetOneParams {
  id: string | number;
}

export interface GetManyParams {
  ids: (string | number)[];
}

export interface MutationParams<T = Record<string, unknown>> {
  id?: string | number;
  data: T;
}

export interface ListResult<T = Record<string, unknown>> {
  data: T[];
  total: number;
}

export interface SingleResult<T = unknown> {
  data: T;
}

export interface DataProvider {
  get: (resource: string, params?: Record<string, unknown>) => Promise<unknown>;
  getList: (resource: string, params?: ListParams) => Promise<ListResult>;
  getOne: (resource: string, params: GetOneParams) => Promise<SingleResult>;
  getMany: (resource: string, params: GetManyParams) => Promise<{ data: Record<string, unknown>[] }>;
  create: (resource: string, params: MutationParams) => Promise<SingleResult>;
  update: (resource: string, params: MutationParams & { id: string | number }) => Promise<SingleResult>;
  delete: (resource: string, params: GetOneParams) => Promise<SingleResult>;
  deleteMany: (resource: string, params: GetManyParams) => Promise<{ data: unknown[] }>;
  syncAPI: (resource: string, params?: MutationParams) => Promise<SingleResult>;
  importProjects: (resource: string, params: MutationParams) => Promise<SingleResult>;
  profileUpdate: (resource: string, params: MutationParams) => Promise<SingleResult>;
  loadSettings: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getLogs: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getTrafficStats: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getErrorDetails: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getLogMetrics: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getCacheStats: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getInstanceInfo: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getTrafficTopology: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getTrafficBackendStats: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  getTrafficHealth: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  updateTrafficWeights: (resource: string, params: MutationParams) => Promise<SingleResult>;
  promoteBackend: (resource: string, params: MutationParams) => Promise<SingleResult>;
  rollbackBackend: (resource: string, params: MutationParams) => Promise<SingleResult>;
  getDetailedHealth: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  checkORStatus: (resource: string, params?: Record<string, unknown>) => Promise<SingleResult>;
  pushDataServers: (resource: string, params: MutationParams) => Promise<SingleResult>;
  resetPassword: (resource: string, params: MutationParams) => Promise<SingleResult>;
  saveStorageFlag: (resource: string, params: MutationParams) => Promise<SingleResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handle401(): never {
  localStorage.removeItem('token');
  localStorage.removeItem('storageManagement');
  window.location.href = '/login';
  throw new Error('Unauthorized');
}

async function handleResponse(response: Response): Promise<any> {
  if (response.status === 401) {
    handle401();
  }
  if (response.status < 200 || response.status >= 300) {
    const error = await response.text();
    throw new Error(error || response.statusText);
  }
  return response.json();
}

function jsonHeaders(): Record<string, string> {
  return {
    ...getHeaders(),
    'Content-Type': 'application/json',
  };
}

/** Simple GET against apiUrl with query-string encoded params. */
async function fetchGet(apiUrl: string, path: string, params: Record<string, unknown> = {}): Promise<any> {
  const url = `${apiUrl}/${path}?_format=json&params=${JSON.stringify(params)}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse(response);
}

/** POST / PUT / DELETE against apiUrl. */
async function fetchMutate(
  apiUrl: string,
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: string,
): Promise<any> {
  const headers = method === 'DELETE' ? getHeaders() : jsonHeaders();
  const response = await fetch(`${apiUrl}/${path}`, {
    method,
    ...(body !== undefined ? { body } : {}),
    headers,
  });
  return handleResponse(response);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDataProvider(apiUrl: string): DataProvider {
  return {
    // ------------------------------------------------------------------
    // Core CRUD
    // ------------------------------------------------------------------

    get: async (resource, params = {}) => {
      return fetchGet(apiUrl, resource, params);
    },

    getList: async (resource, params: ListParams = {}) => {
      const environmentProfile = localStorage.getItem('environment') || 'prod';
      if (!params.filter) {
        params.filter = {};
      }
      if (!params.filter.profile_id && environmentProfile) {
        params.filter.profile_id = environmentProfile;
      }
      params.timestamp = Date.now();

      const url = `${apiUrl}/${resource}?_format=json&params=${JSON.stringify(params)}`;
      try {
        const response = await fetch(url, { headers: getHeaders() });
        if (response.status === 401) {
          handle401();
        }
        const json = await response.json();
        if (!json || !json.data) {
          return { data: [], total: 0 };
        }
        return {
          data: json.data,
          total: json.total || json.data.length,
        };
      } catch (error) {
        // If the error is an auth redirect, re-throw
        if (error instanceof Error && error.message === 'Unauthorized') {
          throw error;
        }
        return { data: [], total: 0 };
      }
    },

    getOne: async (resource, params) => {
      const json = await fetchGet(apiUrl, `${resource}/${params.id}`);
      return { data: json.data };
    },

    getMany: async (resource, params) => {
      const query = params.ids.map((id) => `id=${id}`).join('&');
      const url = `${apiUrl}/${resource}?${query}&_format=json`;
      const response = await fetch(url, { headers: getHeaders() });
      const json = await handleResponse(response);
      return { data: json.data || [] };
    },

    create: async (resource, params) => {
      let data: any = params.data;
      if (resource === 'servers') {
        data = handleConfigField(data);
      }
      let body = JSON.stringify(data);
      body = encodeSpecialChars(body);
      const json = await fetchMutate(apiUrl, resource, 'POST', body);
      return { data: json.data };
    },

    update: async (resource, params) => {
      let data: any = params.data;
      if (resource === 'servers') {
        data = handleConfigField(data);
      }
      let body = JSON.stringify(data);
      body = encodeSpecialChars(body);
      const json = await fetchMutate(apiUrl, `${resource}/${params.id}`, 'PUT', body);
      return { data: json.data };
    },

    delete: async (resource, params) => {
      const json = await fetchMutate(apiUrl, `${resource}/${params.id}`, 'DELETE');
      return { data: json.data };
    },

    deleteMany: async (resource, params) => {
      const responses = await Promise.all(
        params.ids.map((id) =>
          fetch(`${apiUrl}/${resource}/${id}`, {
            method: 'DELETE',
            headers: getHeaders(),
          }),
        ),
      );
      const results = await Promise.all(responses.map((r) => handleResponse(r)));
      return { data: results.map((json: any) => json.data) };
    },

    // ------------------------------------------------------------------
    // Storage flag
    // ------------------------------------------------------------------

    saveStorageFlag: async (resource, params) => {
      const json = await fetchMutate(apiUrl, resource, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },

    // ------------------------------------------------------------------
    // Sync / Import / Profile
    // ------------------------------------------------------------------

    syncAPI: async (resource, params: MutationParams = { data: {} }) => {
      const FRONT_URL = config.frontUrl;
      const instanceRaw = localStorage.getItem('instance');
      if (instanceRaw) {
        const parsedInstance = JSON.parse(instanceRaw) as Record<string, string>;
        const environmentProfile = localStorage.getItem('environment') || 'prod';
        const url = `${FRONT_URL}/${resource}?envprofile=${environmentProfile || ''}&settings=true&instance_hash=${parsedInstance.instance_hash}&serial_number=${parsedInstance.serial_number}`;
        const reqHeaders = getHeaders();
        delete reqHeaders['x-platform'];
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(params.data || {}),
          headers: {
            ...reqHeaders,
            'Content-Type': 'application/json',
          },
        });
        const json = await handleResponse(response);
        return { data: json.data };
      }
      return { data: null };
    },

    importProjects: async (resource, params) => {
      const json = await fetchMutate(apiUrl, resource, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },

    profileUpdate: async (resource, params) => {
      const json = await fetchMutate(apiUrl, resource, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },

    // ------------------------------------------------------------------
    // Settings / Logs
    // ------------------------------------------------------------------

    loadSettings: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, resource, params);
      return { data: json.data };
    },

    getLogs: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, resource, params);
      return { data: json.data };
    },

    // ------------------------------------------------------------------
    // Analytics
    // ------------------------------------------------------------------

    getTrafficStats: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/traffic-stats`, params);
      return { data: json.data };
    },

    getErrorDetails: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/error-details`, params);
      return { data: json.data };
    },

    getLogMetrics: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/log-metrics`, params);
      return { data: json.data };
    },

    getCacheStats: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/cache-stats`, params);
      return { data: json.data };
    },

    // ------------------------------------------------------------------
    // Monitoring
    // ------------------------------------------------------------------

    getInstanceInfo: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/instance-info`, params);
      return { data: json.data };
    },

    getTrafficTopology: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/traffic-topology`, params);
      return { data: json.data };
    },

    getTrafficBackendStats: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/traffic-backend-stats`, params);
      return { data: json.data };
    },

    getTrafficHealth: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/traffic-health`, params);
      return { data: json.data };
    },

    // ------------------------------------------------------------------
    // Traffic management
    // ------------------------------------------------------------------

    updateTrafficWeights: async (resource, params) => {
      const json = await fetchMutate(apiUrl, `${resource}/traffic-weights`, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },

    promoteBackend: async (resource, params) => {
      const json = await fetchMutate(apiUrl, `${resource}/promote`, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },

    rollbackBackend: async (resource, params) => {
      const json = await fetchMutate(apiUrl, `${resource}/rollback`, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },

    // ------------------------------------------------------------------
    // System operations
    // ------------------------------------------------------------------

    getDetailedHealth: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/detailed-health`, params);
      return { data: json.data };
    },

    checkORStatus: async (resource, params = {}) => {
      const json = await fetchGet(apiUrl, `${resource}/or-status`, params);
      return { data: json.data };
    },

    pushDataServers: async (resource, params) => {
      const json = await fetchMutate(apiUrl, `${resource}/push-data`, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },

    resetPassword: async (resource, params) => {
      const json = await fetchMutate(apiUrl, `${resource}/reset-password`, 'POST', JSON.stringify(params.data));
      return { data: json.data };
    },
  };
}

export default createDataProvider;
