'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useOrganizationSettings } from '@/hooks/use-organization-settings';

const FIELD_CLASS =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

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
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the active organization name.
        </p>
      </header>

      <StatusLine
        message={message}
        error={settings.updateOrganization.error?.message ?? null}
      />

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Name only for Phase 7.6.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="max-w-xl space-y-4" onSubmit={save}>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Organization name
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
              disabled={
                !settings.canUpdateOrganization ||
                settings.updateOrganization.isPending ||
                name.trim().length === 0
              }
            >
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
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (message) {
    return <p className="text-sm text-emerald-700">{message}</p>;
  }
  return null;
}
