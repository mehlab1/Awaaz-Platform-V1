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

export const credentialModeSchema = z.enum(['BYOK', 'FINOVA_MANAGED']);
export type CredentialMode = z.infer<typeof credentialModeSchema>;

const pluginCredentialSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  kind: z.string(),
  label: z.string(),
  credentialMode: credentialModeSchema,
  status: z.enum(['NOT_CONFIGURED', 'CONFIGURED', 'VALID', 'INVALID']),
  keyPrefix: z.string().nullable(),
  hasSecret: z.boolean(),
  finovaManagedAvailable: z.boolean(),
  validationError: z.string().nullable(),
  lastValidatedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  markupBps: z.number().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const catalogProviderModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  default: z.boolean().optional(),
});

const catalogProviderSchema = z.object({
  id: z.string(),
  kind: z.enum(['tts', 'llm', 'stt']),
  label: z.string(),
  defaultModel: z.string().optional(),
  models: z.array(catalogProviderModelSchema).optional(),
  supportsByok: z.boolean(),
  supportsFinovaManaged: z.boolean(),
  finovaManagedAvailable: z.boolean(),
  organizationCredential: pluginCredentialSchema.nullable(),
  available: z.boolean(),
  availableVia: credentialModeSchema.nullable(),
});

const catalogResponseSchema = z.object({
  providers: z.array(catalogProviderSchema),
});

const pluginCredentialsSchema = z.array(pluginCredentialSchema);

export type CatalogProvider = z.infer<typeof catalogProviderSchema>;
export type PluginCredential = z.infer<typeof pluginCredentialSchema>;

export interface UpsertCredentialInput {
  credentialMode: CredentialMode;
  apiKey?: string;
  markupBps?: number;
  metadata?: Record<string, unknown>;
}

interface ProviderCredentialsApi {
  activeOrgId: string | undefined;
  canManage: boolean;
  catalog: UseQueryResult<CatalogProvider[], Error>;
  credentials: UseQueryResult<PluginCredential[], Error>;
  upsertCredential: UseMutationResult<
    PluginCredential,
    Error,
    { providerId: string; input: UpsertCredentialInput }
  >;
  validateCredential: UseMutationResult<{ ok: true }, Error, string>;
  deleteCredential: UseMutationResult<{ ok: true }, Error, string>;
}

type ApiCall = (path: string, init?: RequestInit) => Promise<Response>;

export function useProviderCredentials(): ProviderCredentialsApi {
  const { activeOrgId, apiCall, orgs } = useOrgContext();
  const queryClient = useQueryClient();
  const catalogQueryKey = ['plugins-catalog', activeOrgId];
  const credentialsQueryKey = ['plugin-credentials', activeOrgId];
  const role = activeOrgRole(orgs, activeOrgId);
  const canManageCredentials = canManage(role);

  const catalog = useQuery({
    queryKey: catalogQueryKey,
    enabled: Boolean(activeOrgId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: () => fetchCatalog(apiCall),
  });

  const credentials = useQuery({
    queryKey: credentialsQueryKey,
    enabled: Boolean(activeOrgId) && canManageCredentials,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: () => fetchCredentials(apiCall),
  });

  return {
    activeOrgId,
    canManage: canManageCredentials,
    catalog,
    credentials,
    upsertCredential: useMutation({
      mutationFn: ({ providerId, input }) =>
        upsertCredential(apiCall, providerId, input),
      onSuccess: () => invalidateProviderQueries(
        queryClient,
        catalogQueryKey,
        credentialsQueryKey,
      ),
    }),
    validateCredential: useMutation({
      mutationFn: (providerId) => validateCredential(apiCall, providerId),
      onSuccess: () => invalidateProviderQueries(
        queryClient,
        catalogQueryKey,
        credentialsQueryKey,
      ),
    }),
    deleteCredential: useMutation({
      mutationFn: (providerId) => deleteCredential(apiCall, providerId),
      onSuccess: () => invalidateProviderQueries(
        queryClient,
        catalogQueryKey,
        credentialsQueryKey,
      ),
    }),
  };
}

async function fetchCatalog(apiCall: ApiCall): Promise<CatalogProvider[]> {
  const data = await parseResponse(
    await apiCall('/api/v1/plugins/catalog', { method: 'GET' }),
    catalogResponseSchema,
  );
  return data.providers;
}

async function fetchCredentials(apiCall: ApiCall): Promise<PluginCredential[]> {
  return parseResponse(
    await apiCall('/api/v1/plugin-credentials', { method: 'GET' }),
    pluginCredentialsSchema,
  );
}

async function upsertCredential(
  apiCall: ApiCall,
  providerId: string,
  input: UpsertCredentialInput,
): Promise<PluginCredential> {
  return parseResponse(
    await apiCall(`/api/v1/plugin-credentials/${providerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
    pluginCredentialSchema,
  );
}

async function validateCredential(
  apiCall: ApiCall,
  providerId: string,
): Promise<{ ok: true }> {
  await parseResponse(
    await apiCall(`/api/v1/plugin-credentials/${providerId}/validate`, {
      method: 'POST',
    }),
    z.unknown(), // Using unknown as we only care if it succeeds or fails right now, and Zod will allow any json. We can also just ignore the return body.
  );
  return { ok: true };
}

async function deleteCredential(
  apiCall: ApiCall,
  providerId: string,
): Promise<{ ok: true }> {
  await parseResponse(
    await apiCall(`/api/v1/plugin-credentials/${providerId}`, {
      method: 'DELETE',
    }),
    z.unknown(),
  );
  return { ok: true };
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

function invalidateProviderQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  catalogQueryKey: unknown[],
  credentialsQueryKey: unknown[],
): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: catalogQueryKey }),
    queryClient.invalidateQueries({ queryKey: credentialsQueryKey }),
  ]).then(() => undefined);
}
