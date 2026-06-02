'use client';

import { useState, type FormEvent } from 'react';

import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface CreateAgentInput {
  name: string;
  description: string;
}

interface CreateAgentDialogProps {
  isBusy: boolean;
  canCreate: boolean;
  disabledReason?: string;
  onSubmit: (input: CreateAgentInput) => Promise<void>;
}

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

export function CreateAgentDialog({
  isBusy,
  canCreate,
  disabledReason,
  onSubmit,
}: CreateAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) {
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = buildInput(name, description);
    if (!input) {
      setError('Agent name is required.');
      return;
    }
    try {
      await onSubmit(input);
      setName('');
      setDescription('');
      changeOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const createDisabledReason =
    !canCreate
      ? disabledReason ?? 'BUILDER role or higher required.'
      : undefined;

  return (
    <>
      <span
        className="inline-flex"
        tabIndex={createDisabledReason ? 0 : undefined}
        title={createDisabledReason ?? 'Create agent'}
        aria-label={createDisabledReason}
      >
        <Button
          type="button"
          disabled={!canCreate || isBusy}
          data-onboarding-target="create-agent"
          onClick={() => setOpen(true)}
        >
          <Plus />
          New Agent
        </Button>
      </span>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create agent</DialogTitle>
              <DialogDescription>
                Start with the basics. You can add instructions, voice, and call
                settings after creating the agent.
              </DialogDescription>
            </DialogHeader>

            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Agent name
              <input
                className={FIELD_CLASS}
                type="text"
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Description
              <textarea
                className={`${FIELD_CLASS} min-h-20 resize-y`}
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
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
              <Button type="submit" disabled={isBusy || !canCreate}>
                {isBusy ? 'Creating...' : 'Create agent'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buildInput(name: string, description: string): CreateAgentInput | null {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return null;
  }

  return {
    name: trimmedName,
    description: description.trim(),
  };
}
