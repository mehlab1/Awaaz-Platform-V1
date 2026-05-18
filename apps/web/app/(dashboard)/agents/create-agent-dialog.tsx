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

export interface VoiceOption {
  id: string;
  rimeVoiceId: string;
  name: string;
}

export interface CreateAgentInput {
  name: string;
  description: string;
  systemPrompt: string;
  voiceId: string;
}

interface CreateAgentDialogProps {
  isBusy: boolean;
  canCreate: boolean;
  voices: VoiceOption[];
  onSubmit: (input: CreateAgentInput) => Promise<void>;
}

const DEFAULT_PROMPT =
  'You are a helpful AI phone agent. Greet callers clearly, answer concise questions, collect callback details, and offer to route urgent requests to a human.';

const DEFAULT_VOICE_ID = 'astra';

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

export function CreateAgentDialog({
  isBusy,
  canCreate,
  voices,
  onSubmit,
}: CreateAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    if (voices.length === 0) {
      setVoiceId((current) => current.trim() || DEFAULT_VOICE_ID);
      return;
    }
    setVoiceId((current) =>
      voices.some((voice) => voice.rimeVoiceId === current)
        ? current
        : voices[0].rimeVoiceId,
    );
  }, [open, voices]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = buildInput(name, description, systemPrompt, voiceId);
    if (!input) {
      setError('Name, system prompt, and voice are required.');
      return;
    }
    try {
      await onSubmit(input);
      setName('');
      setDescription('');
      setSystemPrompt(DEFAULT_PROMPT);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Button
        type="button"
        disabled={!canCreate || isBusy}
        title={canCreate ? 'Create agent' : 'BUILDER role or higher required.'}
        onClick={() => setOpen(true)}
      >
        <Plus />
        New Agent
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New agent</DialogTitle>
              <DialogDescription>Create a live V1 agent.</DialogDescription>
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

            <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              System prompt
              <textarea
                className={`${FIELD_CLASS} min-h-36 resize-y`}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
              />
            </label>

            <VoiceField
              value={voiceId}
              voices={voices}
              onChange={setVoiceId}
            />

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
              <Button type="submit" disabled={isBusy || !canCreate}>
                {isBusy ? 'Creating...' : 'Create Agent'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface VoiceFieldProps {
  value: string;
  voices: VoiceOption[];
  onChange: (value: string) => void;
}

function VoiceField({ value, voices, onChange }: VoiceFieldProps) {
  if (voices.length === 0) {
    return (
      <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Voice ID
        <input
          className={FIELD_CLASS}
          type="text"
          maxLength={200}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Voice
      <select
        className={FIELD_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {voices.map((voice) => (
          <option key={voice.id} value={voice.rimeVoiceId}>
            {voice.name} ({voice.rimeVoiceId})
          </option>
        ))}
      </select>
    </label>
  );
}

function buildInput(
  name: string,
  description: string,
  systemPrompt: string,
  voiceId: string,
): CreateAgentInput | null {
  const trimmedName = name.trim();
  const trimmedPrompt = systemPrompt.trim();
  const trimmedVoiceId = voiceId.trim();

  if (!trimmedName || !trimmedPrompt || !trimmedVoiceId) {
    return null;
  }

  return {
    name: trimmedName,
    description: description.trim(),
    systemPrompt: trimmedPrompt,
    voiceId: trimmedVoiceId,
  };
}
