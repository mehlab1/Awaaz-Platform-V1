'use client';

import {
  useMutation,
  type UseMutationResult,
} from '@tanstack/react-query';
import { z } from 'zod';

import { useOrgContext } from '@/components/org-context';

const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  clerkOrganizationId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type OrganizationSettings = z.infer<typeof organizationSchema>;

interface UpdateOrganizationInput {
  name: string;
}

interface OrganizationSettingsApi {
  activeOrgId: string | undefined;
  currentName: string;
  canUpdateOrganization: boolean;
  updateOrganization: UseMutationResult<
    OrganizationSettings,
    Error,
    UpdateOrganizationInput
  >;
}

export function useOrganizationSettings(): OrganizationSettingsApi {
  const { activeOrgId, apiCall, orgs, refreshOrgs } = useOrgContext();
  const currentOrg = orgs.find((org) => org.id === activeOrgId);

  return {
    activeOrgId,
    currentName: currentOrg?.name ?? '',
    canUpdateOrganization: canUpdate(currentOrg?.role),
    updateOrganization: useMutation({
      mutationFn: async (input) => {
        const org = await updateOrganization(apiCall, activeOrgId, input);
        await refreshOrgs();
        return org;
      },
    }),
  };
}

async function updateOrganization(
  apiCall: (path: string, init?: RequestInit) => Promise<Response>,
  activeOrgId: string | undefined,
  input: UpdateOrganizationInput,
): Promise<OrganizationSettings> {
  if (!activeOrgId) {
    throw new Error('Select an organization first.');
  }
  const response = await apiCall(`/api/v1/organizations/${activeOrgId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name.trim() }),
  });
  if (!response.ok) {
    throw new Error(await responseMessage(response));
  }
  const data: unknown = await response.json();
  return organizationSchema.parse(data);
}

async function responseMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim() || `Request failed (${response.status})`;
}

function canUpdate(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
