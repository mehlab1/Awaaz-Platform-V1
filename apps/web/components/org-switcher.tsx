'use client';

import { useOrgContext } from '@/components/org-context';
import { CreateOrganizationDialog } from '@/components/create-organization-dialog';

export function OrgSwitcher() {
  const {
    orgs,
    activeOrgId,
    setActiveOrgId,
    loadingOrgs,
  } = useOrgContext();

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="text-muted-foreground">Active organization</div>
      <div className="mt-1 font-mono text-xs break-all">
        {loadingOrgs
          ? 'Loading…'
          : activeOrgId ?? 'None — join or create an organization'}
      </div>
      {orgs.length > 0 ? (
        <select
          className="mt-2 w-full rounded border border-input bg-background px-2 py-1 text-xs"
          value={activeOrgId ?? ''}
          onChange={(e) =>
            setActiveOrgId(e.target.value.length > 0 ? e.target.value : undefined)
          }
          aria-label="Switch organization"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : null}
      <div className="mt-3">
        <CreateOrganizationDialog
          variant="outline"
          buttonLabel={orgs.length > 0 ? 'Create another organization' : 'Create organization'}
        />
      </div>
    </div>
  );
}
