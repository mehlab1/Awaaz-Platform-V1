'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CreateOrganizationDialog } from '@/components/create-organization-dialog';
import { useOrganizationSettings } from '@/hooks/use-organization-settings';

const FIELD_CLASS =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm outline-none ring-offset-background mt-1.5 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function OrganizationSettingsClient() {
  const settings = useOrganizationSettings();
  const [name, setName] = useState(settings.currentName);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(settings.currentName);
  }, [settings.currentName]);

  if (!settings.activeOrgId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization first.
      </p>
    );
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    await settings.updateOrganization.mutateAsync({ name });
    setMessage('Organization name updated.');
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Update the active organization name or create another workspace.
            </p>
          </div>
          <CreateOrganizationDialog variant="outline" />
        </div>
      </header>

      <StatusLine
        message={message}
        error={settings.updateOrganization.error?.message ?? null}
      />

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Update your workspace name.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 pb-4 border-b border-border/40 mb-4">
            <div className="size-14 rounded-full bg-gradient-to-br from-primary/80 to-primary/30 flex items-center justify-center text-primary-foreground font-bold text-lg shadow-md">
              {name.trim().charAt(0).toUpperCase() || 'O'}
            </div>
            <div>
              <p className="font-semibold text-foreground">{name || 'Untitled Organization'}</p>
              <p className="text-xs text-muted-foreground">Workspace settings</p>
            </div>
          </div>
          <form className="max-w-xl space-y-4" onSubmit={save}>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Organization name
              <p className="text-[11px] text-muted-foreground font-normal normal-case tracking-normal mt-0.5">This name appears across all team dashboards and notifications.</p>
              <input
                className={FIELD_CLASS}
                value={name}
                disabled={!settings.canUpdateOrganization}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {!settings.canUpdateOrganization ? (
              <p className="text-sm text-muted-foreground">
                Organization updates require OWNER or ADMIN role.
              </p>
            ) : null}
            <Button
              type="submit"
              className="px-8"
              disabled={
                !settings.canUpdateOrganization ||
                settings.updateOrganization.isPending ||
                name.trim().length === 0
              }
            >
              <Save className="mr-2 size-4" />
              {settings.updateOrganization.isPending ? 'Saving...' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusLine({
  message,
  error,
}: {
  message: string | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" />
        {error}
      </div>
    );
  }
  if (message) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
        <CheckCircle2 className="size-4 shrink-0" />
        {message}
      </div>
    );
  }
  return null;
}
