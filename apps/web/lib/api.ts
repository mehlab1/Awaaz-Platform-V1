const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ApiFetchOptions extends RequestInit {
  /**
   * Clerk session JWT (`useAuth().getToken` on the client, or `auth().getToken` on the server).
   * Keeps Clerk out of this module so imports stay SSR-safe with the Next.js App Router.
   */
  getToken: () => Promise<string | null | undefined>;
  /**
   * Mapped to tenant via `x-organization-id`; may be omitted or empty only for endpoints
   * that do not mount tenant middleware (e.g. `GET /api/v1/organizations`).
   */
  organizationId?: string;
}

function resolveUrl(path: string, baseUrl: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const base = baseUrl.replace(/\/$/, '');
  const segment = path.startsWith('/') ? path : `/${path}`;
  return `${base}${segment}`;
}

/**
 * Attaches Clerk JWT (`Authorization: Bearer <token>`) when `getToken()` returns a string,
 * and always sends `x-organization-id` (possibly empty; tenant-aware routes still need a valid org serverside).
 *
 * SSR-safe because Clerk is injected: pass `useAuth().getToken` on the client, or expose the same callable
 * from Clerk's server helpers when calling from Route Handlers or Server Components.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions,
): Promise<Response> {
  const { getToken, organizationId, headers: incomingHeaders, ...fetchInit } =
    options;

  const token = await getToken();

  const headers = new Headers(incomingHeaders ?? undefined);

  if (typeof token === 'string' && token.length > 0) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  headers.set(
    'x-organization-id',
    typeof organizationId === 'string' ? organizationId.trim() : '',
  );

  const url = resolveUrl(path, apiBaseUrl);

  return fetch(url, {
    ...fetchInit,
    headers,
    credentials: fetchInit.credentials ?? 'include',
  });
}

/** Alias matching spec naming; identical to apiFetch. */
export { apiFetch as apiClient };
