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
  apiCall: (path: string, init?: RequestInit) => Promise<Response>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
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
      apiCall,
    }),
    [orgs, activeOrgId, setActiveOrgId, loadingOrgs, refreshOrgs, apiCall],
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
