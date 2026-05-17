'use client';

import { useEffect, useState, type FormEvent } from 'react';

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
import type { RegisterPhoneNumberInput } from '@/hooks/use-phone-numbers';

const FIELD_CLASS =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

interface AddNumberDialogProps {
  isBusy: boolean;
  onSubmit: (input: RegisterPhoneNumberInput) => Promise<void>;
}

export function AddNumberDialog({ isBusy, onSubmit }: AddNumberDialogProps) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [twilioSid, setTwilioSid] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      return;
    }
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isE164(number)) {
      setError('Use E.164 format, for example +15550174243.');
      return;
    }
    try {
      await onSubmit({ number, friendlyName, twilioSid });
      setNumber('');
      setFriendlyName('');
      setTwilioSid('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        Add Number
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add phone number</DialogTitle>
              <DialogDescription>
                Connect an existing Twilio number.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Number
              <input
                className={FIELD_CLASS}
                placeholder="+15550174243"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Friendly name
              <input
                className={FIELD_CLASS}
                value={friendlyName}
                onChange={(event) => setFriendlyName(event.target.value)}
              />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Twilio SID
              <input
                className={FIELD_CLASS}
                value={twilioSid}
                onChange={(event) => setTwilioSid(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? 'Adding...' : 'Add Number'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function isE164(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value.trim());
}
