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
  const activeOrg = orgs.find((org) => org.id === activeOrgId);

  return (
    <div className="rounded-lg border border-border bg-background p-2.5 text-sm shadow-sm">
      <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        Organization
      </div>
      <div
        className="mt-1 truncate font-medium text-xs"
        title={activeOrg?.name ?? activeOrgId ?? undefined}
      >
        {loadingOrgs
          ? 'Loading...'
          : activeOrg?.name ?? 'None selected'}
      </div>
      {orgs.length > 0 ? (
        <select
          className="mt-2 h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          buttonLabel={orgs.length > 0 ? 'New organization' : 'Create organization'}
          buttonSize="sm"
          buttonClassName="h-7 w-full justify-start rounded-md px-2 text-xs"
        />
      </div>
    </div>
  );
}
