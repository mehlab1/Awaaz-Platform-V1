'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

export interface AgentSystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  statusLabel?: string;
  updatedLabel?: string;
  helperLabel?: string;
}

export function AgentSystemPromptEditor({
  value,
  onChange,
  disabled = false,
  statusLabel,
  updatedLabel,
  helperLabel,
}: AgentSystemPromptEditorProps) {
  const id = useId();
  const characterCount = value.length.toLocaleString();

  return (
    <div className="mx-auto max-w-[980px] rounded-xl border border-border/60 bg-muted/10 p-3 shadow-sm">
      <label htmlFor={id} className="sr-only">
        System prompt
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1 text-xs text-muted-foreground">
        <span className="rounded-full bg-background px-2.5 py-1 font-medium text-foreground">
          {statusLabel ?? 'Draft editor'}
        </span>
        <span>{updatedLabel ?? 'Start writing your instructions'}</span>
      </div>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        spellCheck
        placeholder="Teach your AI assistant how to behave. Describe its role, tone, boundaries, call goals, escalation rules, and anything it must never say."
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'min-h-[62vh] w-full resize-y scroll-smooth rounded-lg border border-transparent bg-background/95 px-6 py-6 text-[1rem] leading-8 text-foreground outline-none transition',
          'placeholder:text-muted-foreground/70 focus:border-ring/70 focus:bg-background focus:ring-4 focus:ring-ring/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 text-xs text-muted-foreground">
        <span>{helperLabel ?? 'Use plain language. Write goals, tone, boundaries, and escalation rules.'}</span>
        <span>{characterCount} characters</span>
      </div>
    </div>
  );
}
