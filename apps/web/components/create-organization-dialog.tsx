'use client';

import { useState, type FormEvent } from 'react';

import { PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOrgContext } from '@/components/org-context';
import { cn } from '@/lib/utils';

const FIELD_CLASS =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

interface CreateOrganizationDialogProps {
  variant?: 'button' | 'inline' | 'outline';
  buttonLabel?: string;
  buttonClassName?: string;
  buttonSize?: 'default' | 'xs' | 'sm' | 'lg';
}

export function CreateOrganizationDialog({
  variant = 'button',
  buttonLabel = 'Create organization',
  buttonClassName,
  buttonSize = 'default',
}: CreateOrganizationDialogProps) {
  const { createOrganization } = useOrgContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (trimmedName.length === 0) {
      setError('Enter an organization name.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await createOrganization({
        name: trimmedName,
        slug: trimmedSlug.length > 0 ? trimmedSlug : undefined,
      });
      setSuccess(`Organization ${created.name} created.`);
      setName('');
      setSlug('');
      setOpen(false);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {variant === 'button' ? (
        <Button
          type="button"
          size={buttonSize}
          className={buttonClassName}
          onClick={() => setOpen(true)}
        >
          <PlusCircle className="size-4" />
          {buttonLabel}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={buttonSize}
          className={cn('gap-1.5', buttonClassName)}
          onClick={() => setOpen(true)}
        >
          <PlusCircle className="size-4" />
          {buttonLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(nextOpen) => !submitting && setOpen(nextOpen)}>
        <DialogContent className="sm:max-w-md">
          <form className="space-y-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
              <DialogDescription>
                Create a new workspace and make yourself the owner.
              </DialogDescription>
            </DialogHeader>

            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Organization name
              <input
                className={FIELD_CLASS}
                value={name}
                disabled={submitting}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Slug <span className="normal-case text-muted-foreground/80">optional</span>
              <input
                className={FIELD_CLASS}
                value={slug}
                disabled={submitting}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="my-org"
              />
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || name.trim().length === 0}>
                {submitting ? 'Creating...' : 'Create organization'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function userMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/duplicate|already exists|unique/i.test(message)) {
    return 'That organization name or slug is already in use.';
  }
  if (/unauthoriz|forbidden/i.test(message)) {
    return 'You are not allowed to create organizations here.';
  }
  if (/network/i.test(message)) {
    return 'Network error while creating the organization. Please try again.';
  }
  return message || 'Could not create organization.';
}
