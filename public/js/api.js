export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

let csrfToken = '';
export function setCsrfToken(value) { csrfToken = value || ''; }
export function getCsrfToken() { return csrfToken; }

export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (options.body !== undefined && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined || isForm || typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(data?.message || 'Something went wrong. Please try again.', response.status, data);
  if (data?.csrfToken) csrfToken = data.csrfToken;
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body, extra = {}) => request(path, { ...extra, method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
