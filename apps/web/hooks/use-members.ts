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

const roleSchema = z.enum(['OWNER', 'ADMIN', 'BUILDER', 'VIEWER']);

const memberSchema = z.object({
  membershipId: z.string(),
  userId: z.string(),
  role: roleSchema,
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

const invitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: roleSchema,
  clerkInviteId: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
});

const membersSchema = z.array(memberSchema);
const invitationsSchema = z.array(invitationSchema);
const inviteResponseSchema = invitationSchema.pick({
  id: true,
  email: true,
  role: true,
  clerkInviteId: true,
});

export type MemberRole = z.infer<typeof roleSchema>;
export type MemberRow = z.infer<typeof memberSchema>;
export type PendingInvitationRow = z.infer<typeof invitationSchema>;
export type InviteMemberResponse = z.infer<typeof inviteResponseSchema>;

export interface InviteMemberInput {
  email: string;
  role: Exclude<MemberRole, 'OWNER'>;
}

interface MembersApi {
  activeOrgId: string | undefined;
  canManageMembers: boolean;
  members: UseQueryResult<MemberRow[], Error>;
  invitations: UseQueryResult<PendingInvitationRow[], Error>;
  inviteMember: UseMutationResult<InviteMemberResponse, Error, InviteMemberInput>;
  cancelInvitation: UseMutationResult<{ ok: true }, Error, string>;
  resendInvitation: UseMutationResult<PendingInvitationRow, Error, string>;
}

type ApiCall = (path: string, init?: RequestInit) => Promise<Response>;

export function useMembers(): MembersApi {
  const { activeOrgId, apiCall, orgs } = useOrgContext();
  const queryClient = useQueryClient();
  const canManageMembers = canManage(activeOrgRole(orgs, activeOrgId));
  const membersKey = ['members', activeOrgId];
  const invitationsKey = ['invitations', activeOrgId];

  const members = useQuery({
    queryKey: membersKey,
    enabled: Boolean(activeOrgId),
    queryFn: () => fetchMembers(apiCall, activeOrgId),
  });
  const invitations = useQuery({
    queryKey: invitationsKey,
    enabled: Boolean(activeOrgId) && canManageMembers,
    queryFn: () => fetchInvitations(apiCall, activeOrgId),
  });

  const invalidateMembers = () => invalidate(queryClient, membersKey);
  const invalidateInvitations = () => invalidate(queryClient, invitationsKey);

  return {
    activeOrgId,
    canManageMembers,
    members,
    invitations,
    inviteMember: useMutation({
      mutationFn: (input) => inviteMember(apiCall, activeOrgId, input),
      onSuccess: invalidateInvitations,
    }),
    cancelInvitation: useMutation({
      mutationFn: (invitationId) =>
        cancelInvitation(apiCall, activeOrgId, invitationId),
      onSuccess: invalidateInvitations,
    }),
    resendInvitation: useMutation({
      mutationFn: (invitationId) =>
        resendInvitation(apiCall, activeOrgId, invitationId),
      onSuccess: async () => {
        await invalidateInvitations();
        await invalidateMembers();
      },
    }),
  };
}

async function fetchMembers(
  apiCall: ApiCall,
  organizationId: string | undefined,
): Promise<MemberRow[]> {
  return parseResponse(
    await apiCall(`/api/v1/organizations/${requireOrg(organizationId)}/members`),
    membersSchema,
  );
}

async function fetchInvitations(
  apiCall: ApiCall,
  organizationId: string | undefined,
): Promise<PendingInvitationRow[]> {
  return parseResponse(
    await apiCall(
      `/api/v1/organizations/${requireOrg(organizationId)}/invitations`,
    ),
    invitationsSchema,
  );
}

async function inviteMember(
  apiCall: ApiCall,
  organizationId: string | undefined,
  input: InviteMemberInput,
): Promise<InviteMemberResponse> {
  return parseResponse(
    await apiCall(
      `/api/v1/organizations/${requireOrg(organizationId)}/members/invite`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.email.trim(),
          role: input.role,
        }),
      },
    ),
    inviteResponseSchema,
  );
}

async function cancelInvitation(
  apiCall: ApiCall,
  organizationId: string | undefined,
  invitationId: string,
): Promise<{ ok: true }> {
  return parseResponse(
    await apiCall(
      `/api/v1/organizations/${requireOrg(organizationId)}/invitations/${invitationId}`,
      { method: 'DELETE' },
    ),
    z.object({ ok: z.literal(true) }),
  );
}

async function resendInvitation(
  apiCall: ApiCall,
  organizationId: string | undefined,
  invitationId: string,
): Promise<PendingInvitationRow> {
  return parseResponse(
    await apiCall(
      `/api/v1/organizations/${requireOrg(organizationId)}/invitations/${invitationId}/resend`,
      { method: 'POST' },
    ),
    invitationSchema,
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

function requireOrg(organizationId: string | undefined): string {
  if (!organizationId) {
    throw new Error('Select an organization first.');
  }
  return organizationId;
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
