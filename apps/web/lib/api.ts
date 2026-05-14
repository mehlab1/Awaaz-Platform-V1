const baseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiFetch(
  path: string,
  options: RequestInit & {
    getToken: () => Promise<string | null | undefined>;
    organizationId?: string;
  },
): Promise<Response> {
  const { getToken, organizationId, ...fetchInit } = options;

  const token = await getToken();
  const headers = new Headers(fetchInit.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (organizationId) {
    headers.set('x-organization-id', organizationId);
  }

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  return fetch(url, {
    ...fetchInit,
    headers,
    credentials: fetchInit.credentials ?? 'include',
  });
}
