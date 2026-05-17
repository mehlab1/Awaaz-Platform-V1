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

const agentOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
});

const phoneNumberSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  agentId: z.string().nullable(),
  number: z.string(),
  friendlyName: z.string().nullable(),
  twilioSid: z.string().nullable(),
  liveKitDispatchRuleId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  agent: agentOptionSchema.nullable().optional(),
});

const phoneNumbersSchema = z.array(phoneNumberSchema);
const agentsSchema = z.array(agentOptionSchema);

export type PhoneNumberRow = z.infer<typeof phoneNumberSchema>;
export type PhoneAgentOption = z.infer<typeof agentOptionSchema>;

export interface RegisterPhoneNumberInput {
  number: string;
  friendlyName?: string;
  twilioSid?: string;
}

export interface AssignPhoneNumberInput {
  phoneNumberId: string;
  agentId: string | null;
}

interface PhoneNumbersApi {
  activeOrgId: string | undefined;
  phoneNumbers: UseQueryResult<PhoneNumberRow[], Error>;
  agents: UseQueryResult<PhoneAgentOption[], Error>;
  registerPhoneNumber: UseMutationResult<
    PhoneNumberRow,
    Error,
    RegisterPhoneNumberInput
  >;
  assignPhoneNumber: UseMutationResult<
    PhoneNumberRow,
    Error,
    AssignPhoneNumberInput
  >;
}

type ApiCall = (path: string, init?: RequestInit) => Promise<Response>;

export function usePhoneNumbers(): PhoneNumbersApi {
  const { activeOrgId, apiCall } = useOrgContext();
  const queryClient = useQueryClient();
  const enabled = Boolean(activeOrgId);
  const queryKey = ['phone-numbers', activeOrgId];

  const phoneNumbers = useQuery({
    queryKey,
    enabled,
    queryFn: () => fetchList(apiCall),
  });
  const agents = useQuery({
    queryKey: ['phone-number-agents', activeOrgId],
    enabled,
    queryFn: () => fetchAgents(apiCall),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey }).then(() => undefined);

  return {
    activeOrgId,
    phoneNumbers,
    agents,
    registerPhoneNumber: useMutation({
      mutationFn: (input) => registerPhoneNumber(apiCall, input),
      onSuccess: invalidate,
    }),
    assignPhoneNumber: useMutation({
      mutationFn: (input) => assignPhoneNumber(apiCall, input),
      onSuccess: invalidate,
    }),
  };
}

async function fetchList(apiCall: ApiCall): Promise<PhoneNumberRow[]> {
  return parseResponse(
    await apiCall('/api/v1/phone-numbers', { method: 'GET' }),
    phoneNumbersSchema,
  );
}

async function fetchAgents(apiCall: ApiCall): Promise<PhoneAgentOption[]> {
  return parseResponse(
    await apiCall('/api/v1/agents', { method: 'GET' }),
    agentsSchema,
  );
}

async function registerPhoneNumber(
  apiCall: ApiCall,
  input: RegisterPhoneNumberInput,
): Promise<PhoneNumberRow> {
  return parseResponse(
    await apiCall('/api/v1/phone-numbers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trimOptionalFields(input)),
    }),
    phoneNumberSchema,
  );
}

async function assignPhoneNumber(
  apiCall: ApiCall,
  input: AssignPhoneNumberInput,
): Promise<PhoneNumberRow> {
  const patched = await parseResponse(
    await apiCall(`/api/v1/phone-numbers/${input.phoneNumberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: input.agentId }),
    }),
    phoneNumberSchema,
  );
  if (input.agentId === null) {
    return patched;
  }
  return parseResponse(
    await apiCall(
      `/api/v1/phone-numbers/${input.phoneNumberId}/sync-dispatch-rule`,
      { method: 'POST' },
    ),
    phoneNumberSchema,
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

function trimOptionalFields(input: RegisterPhoneNumberInput) {
  return {
    number: input.number.trim(),
    friendlyName: blankToUndefined(input.friendlyName),
    twilioSid: blankToUndefined(input.twilioSid),
  };
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
