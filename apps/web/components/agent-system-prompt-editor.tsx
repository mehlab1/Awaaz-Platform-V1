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
    <div className="w-full flex-1 flex flex-col rounded-xl border border-border/40 bg-muted/5 p-2 shadow-sm">
      <label htmlFor={id} className="sr-only">
        System prompt
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        <span className="rounded-full bg-background px-2.5 py-1 font-semibold text-foreground border border-border/30">
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
          'min-h-[300px] flex-1 w-full resize-y scroll-smooth rounded-lg border border-transparent bg-background/95 px-5 py-4 text-sm leading-7 tracking-tight text-foreground outline-none transition',
          'placeholder:text-muted-foreground/70 focus:border-ring/70 focus:bg-background focus:ring-4 focus:ring-ring/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">
        <span>{helperLabel ?? 'Use plain language. Write goals, tone, boundaries, and escalation rules.'}</span>
        <span>{characterCount} characters</span>
      </div>
    </div>
  );
}
