// Token storage + a one-time global fetch interceptor.
// Because API calls are scattered (no central client), we patch window.fetch once
// to attach `Authorization: Bearer <token>` to API requests and react to 401s.
import { API_BASE } from '../config/constants';

const TOKEN_KEY = 'sitelens_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

let installed = false;

/** Install once (from AuthProvider). Adds the Bearer header to /api/* calls and
 *  invokes onUnauthorized() when the server returns 401 (expired/invalid token). */
export function installAuthFetch(onUnauthorized: () => void): void {
  if (installed) return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    // Our API calls (but NOT /tiles, which is public and goes via CloudFront→Martin)
    const isApi = url.startsWith(`${API_BASE}/api`) || url.startsWith('/api');

    if (isApi) {
      const token = getToken();
      const headers = new Headers(init.headers || {});
      if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }

    const res = await original(input as any, init);

    if (isApi && res.status === 401) {
      clearToken();
      onUnauthorized();
    }
    return res;
  };
}
