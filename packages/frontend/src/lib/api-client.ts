type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiError extends Error {
  code: string;
  status: number;
  details?: Array<{ field: string; message: string }>;

  constructor(status: number, code: string, message: string, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;
  const config: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
  };
  if (body) config.body = JSON.stringify(body);

  const baseUrl = typeof window === 'undefined'
    ? process.env.API_URL || 'http://localhost:3000'
    : '';
  const url = typeof window === 'undefined'
    ? `${baseUrl}${endpoint}`
    : `/api/proxy${endpoint}`;

  const res = await fetch(url, config);
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  if (!res.ok) {
    const error = json.error || {};
    throw new ApiError(res.status, error.code || 'UNKNOWN', error.message || 'An error occurred', error.details);
  }
  return json;
}

export const api = {
  get: <T>(endpoint: string) => apiClient<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) => apiClient<T>(endpoint, { method: 'POST', body }),
  patch: <T>(endpoint: string, body?: unknown) => apiClient<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => apiClient<T>(endpoint, { method: 'DELETE' }),
  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const res = await fetch(`/api/proxy${endpoint}`, {
      method: 'POST', body: formData, credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok) {
      const error = json.error || {};
      throw new ApiError(res.status, error.code || 'UNKNOWN', error.message || 'Upload failed', error.details);
    }
    return json;
  },
};

export { ApiError };
