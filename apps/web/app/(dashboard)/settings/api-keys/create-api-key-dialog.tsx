'use client';

import { useState, type FormEvent } from 'react';

import { KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CreatedApiKey } from '@/hooks/use-api-keys';

const FIELD_CLASS =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

interface CreateApiKeyDialogProps {
  isBusy: boolean;
  canCreate: boolean;
  onSubmit: (name: string) => Promise<CreatedApiKey>;
  onClosed: () => void;
}

export function CreateApiKeyDialog({
  isBusy,
  canCreate,
  onSubmit,
  onClosed,
}: CreateApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError('Name is required.');
      return;
    }
    try {
      setCreatedKey(await onSubmit(name));
      setName('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      return;
    }
    setError(null);
    setCreatedKey(null);
    onClosed();
  };

  return (
    <>
      <Button
        type="button"
        disabled={!canCreate}
        onClick={() => setOpen(true)}
      >
        <KeyRound />
        Create Key
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sm:max-w-lg">
          {createdKey ? (
            <OneTimeKeyView
              apiKey={createdKey}
              onClose={() => changeOpen(false)}
            />
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  The full key is shown only once.
                </DialogDescription>
              </DialogHeader>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Name
                <input
                  className={FIELD_CLASS}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => changeOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? 'Creating...' : 'Create Key'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OneTimeKeyView({
  apiKey,
  onClose,
}: {
  apiKey: CreatedApiKey;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{apiKey.name}</DialogTitle>
        <DialogDescription>
          Save this key now. It will not be shown again.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-border bg-muted/50 p-3">
        <div className="font-mono text-xs break-all">{apiKey.fullKey}</div>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
