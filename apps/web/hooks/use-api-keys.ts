'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { z } from 'zod';

import { useOrgContext } from '@/components/org-context';

const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  isRevoked: z.boolean(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createdApiKeySchema = apiKeySchema.extend({
  fullKey: z.string(),
});

const apiKeysSchema = z.array(apiKeySchema);

export type ApiKeyRow = z.infer<typeof apiKeySchema>;
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;

export interface CreateApiKeyInput {
  name: string;
}

interface ApiKeysApi {
  activeOrgId: string | undefined;
  canManageApiKeys: boolean;
  apiKeys: UseQueryResult<ApiKeyRow[], Error>;
  createApiKey: UseMutationResult<CreatedApiKey, Error, CreateApiKeyInput>;
  revokeApiKey: UseMutationResult<{ ok: true }, Error, string>;
}

type ApiCall = (path: string, init?: RequestInit) => Promise<Response>;

export function useApiKeys(): ApiKeysApi {
  const { activeOrgId, apiCall, orgs } = useOrgContext();
  const queryClient = useQueryClient();
  const queryKey = ['api-keys', activeOrgId];
  const canManageApiKeys = canManage(activeOrgRole(orgs, activeOrgId));

  const apiKeys = useQuery({
    queryKey,
    enabled: Boolean(activeOrgId) && canManageApiKeys,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: () => fetchApiKeys(apiCall),
  });

  return {
    activeOrgId,
    canManageApiKeys,
    apiKeys,
    createApiKey: useMutation({
      mutationFn: (input) => createApiKey(apiCall, input),
      onSuccess: () => invalidate(queryClient, queryKey),
    }),
    revokeApiKey: useMutation({
      mutationFn: (apiKeyId) => revokeApiKey(apiCall, apiKeyId),
      onSuccess: () => invalidate(queryClient, queryKey),
    }),
  };
}

async function fetchApiKeys(apiCall: ApiCall): Promise<ApiKeyRow[]> {
  return parseResponse(
    await apiCall('/api/v1/api-keys', { method: 'GET' }),
    apiKeysSchema,
  );
}

async function createApiKey(
  apiCall: ApiCall,
  input: CreateApiKeyInput,
): Promise<CreatedApiKey> {
  return parseResponse(
    await apiCall('/api/v1/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name.trim() }),
    }),
    createdApiKeySchema,
  );
}

async function revokeApiKey(
  apiCall: ApiCall,
  apiKeyId: string,
): Promise<{ ok: true }> {
  return parseResponse(
    await apiCall(`/api/v1/api-keys/${apiKeyId}`, { method: 'DELETE' }),
    z.object({ ok: z.literal(true) }),
  );
}

async function parseResponse<T extends z.ZodType>(
  response: Response,
  schema: T,
): Promise<z.infer<T>> {
  if (!response.ok) {
    throw new Error(await responseMessage(response));
  }
  const data: unknown = await response.json();
  return schema.parse(data);
}

async function responseMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim() || `Request failed (${response.status})`;
}

function activeOrgRole(
  orgs: Array<{ id: string; role: string }>,
  activeOrgId: string | undefined,
): string | undefined {
  return orgs.find((org) => org.id === activeOrgId)?.role;
}

function canManage(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: unknown[],
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey }).then(() => undefined);
}
