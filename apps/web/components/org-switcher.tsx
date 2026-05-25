'use client';

import { useOrgContext } from '@/components/org-context';
import { CreateOrganizationDialog } from '@/components/create-organization-dialog';

interface OrgSwitcherProps {
  compact?: boolean;
}

export function OrgSwitcher({ compact = false }: OrgSwitcherProps) {
  const {
    orgs,
    activeOrgId,
    setActiveOrgId,
    loadingOrgs,
  } = useOrgContext();
  const activeOrg = orgs.find((org) => org.id === activeOrgId);
  const title = activeOrg?.name ?? activeOrgId ?? 'No organization selected';

  if (compact) {
    return (
      <div
        className="rounded-md bg-background/80 p-1 text-xs"
        title={title}
      >
        <span className="sr-only">Organization</span>
        {orgs.length > 0 ? (
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        ) : (
          <div className="flex h-8 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
            Org
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-background p-3 text-sm shadow-sm">
      <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
        Organization
      </div>
      <div
        className="mt-1 truncate font-medium text-sm"
        title={title}
      >
        {loadingOrgs
          ? 'Loading...'
          : activeOrg?.name ?? 'None selected'}
      </div>
      {orgs.length > 0 ? (
        <select
          className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
