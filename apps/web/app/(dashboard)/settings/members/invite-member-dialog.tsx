'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { InviteMemberInput } from '@/hooks/use-members';

const ROLE_OPTIONS: InviteMemberInput['role'][] = [
  'VIEWER',
  'BUILDER',
  'ADMIN',
];

const FIELD_CLASS =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

interface InviteMemberDialogProps {
  isBusy: boolean;
  canInvite: boolean;
  onSubmit: (input: InviteMemberInput) => Promise<void>;
}

export function InviteMemberDialog({
  isBusy,
  canInvite,
  onSubmit,
}: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteMemberInput['role']>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      return;
    }
    setError(null);
    setSubmitting(false);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || isBusy) {
      return;
    }
    if (!isEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ email, role });
      setEmail('');
      setRole('VIEWER');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isBusy || submitting;

  return (
    <>
      <Button
        type="button"
        disabled={!canInvite}
        onClick={() => setOpen(true)}
      >
        <UserPlus />
        Invite Member
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !busy && setOpen(nextOpen)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Invite member</DialogTitle>
              <DialogDescription>
                Send an organization invitation.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
              <input
                className={FIELD_CLASS}
                type="email"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Role
              <select
                className={FIELD_CLASS}
                value={role}
                disabled={busy}
                onChange={(event) =>
                  setRole(event.target.value as InviteMemberInput['role'])
                }
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending...' : 'Send Invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
