"use client";

import useLocalStorageState from "use-local-storage-state";

const orgs: { id: string; name: string }[] = [];

export function OrgSwitcher() {
  const [activeOrg, setActiveOrg] = useLocalStorageState<string | undefined>(
    "awaaz_active_org",
    { defaultValue: orgs[0]?.id },
  );

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="text-muted-foreground">Active organization</div>
      <div className="mt-1 font-mono text-xs break-all">
        {activeOrg ?? "None (orgs API wired in Phase 2)"}
      </div>
      {orgs.length > 1 ? (
        <select
          className="mt-2 w-full rounded border border-input bg-background px-2 py-1 text-xs"
          value={activeOrg ?? ""}
          onChange={(e) => setActiveOrg(e.target.value || undefined)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
