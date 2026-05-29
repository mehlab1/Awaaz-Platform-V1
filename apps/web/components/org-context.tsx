'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '@clerk/nextjs';
import { z } from 'zod';
import useLocalStorageState from 'use-local-storage-state';

import { apiFetch } from '@/lib/api';

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface OrgContextValue {
  orgs: OrgSummary[];
  activeOrgId: string | undefined;
  setActiveOrgId: (value: string | undefined) => void;
  loadingOrgs: boolean;
  refreshOrgs: () => Promise<void>;
  createOrganization: (input: {
    name: string;
    slug?: string;
  }) => Promise<OrgSummary>;
  apiCall: (path: string, init?: RequestInit) => Promise<Response>;
}

const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: z.string(),
});

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [activeOrgId, setActiveOrgId] = useLocalStorageState<
    string | undefined
  >('awaaz_active_org', { defaultValue: undefined });

  const refreshOrgs = useCallback(async () => {
    if (!isLoaded) {
      return;
    }
    setLoadingOrgs(true);
    try {
      const res = await apiFetch('/api/v1/organizations', {
        method: 'GET',
        getToken,
      });
      if (!res.ok) {
        return;
      }
      setOrgs((await res.json()) as OrgSummary[]);
    } finally {
      setLoadingOrgs(false);
    }
  }, [getToken, isLoaded]);

  const createOrganization = useCallback(
    async (input: { name: string; slug?: string }) => {
      const response = await apiFetch('/api/v1/organizations', {
        method: 'POST',
        getToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name.trim(),
          ...(input.slug?.trim() ? { slug: input.slug.trim() } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }

      const data: unknown = await response.json();
      const created = organizationSchema.parse(data);
      const normalized: OrgSummary = {
        id: created.id,
        name: created.name,
        slug: created.slug,
        role: created.role,
      };

      await refreshOrgs();
      setActiveOrgId(normalized.id);

      return normalized;
    },
    [getToken, refreshOrgs, setActiveOrgId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) {
        await refreshOrgs();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshOrgs]);

  useEffect(() => {
    if (loadingOrgs) {
      return;
    }
    if (orgs.length === 0) {
      setActiveOrgId(undefined);
      return;
    }
    const valid =
      activeOrgId !== undefined && orgs.some((o) => o.id === activeOrgId);
    if (!valid) {
      setActiveOrgId(orgs[0].id);
    }
  }, [orgs, activeOrgId, setActiveOrgId, loadingOrgs]);

  const apiCall = useCallback(
    (path: string, init: RequestInit = {}) =>
      apiFetch(path, {
        ...init,
        getToken,
        organizationId: activeOrgId,
      }),
    [activeOrgId, getToken],
  );

  const value = useMemo(
    () => ({
      orgs,
      activeOrgId,
      setActiveOrgId,
      loadingOrgs,
      refreshOrgs,
      createOrganization,
      apiCall,
    }),
    [
      orgs,
      activeOrgId,
      setActiveOrgId,
      loadingOrgs,
      refreshOrgs,
      createOrganization,
      apiCall,
    ],
  );

  return (
    <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
  );
}

export function useOrgContext(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error('useOrgContext must be used within OrgProvider');
  }
  return ctx;
}

async function responseMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim() || `Request failed (${response.status})`;
}
