'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

export interface AgentSystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AgentSystemPromptEditor({
  value,
  onChange,
  disabled = false,
}: AgentSystemPromptEditorProps) {
  const id = useId();
  const characterCount = value.length.toLocaleString();

  return (
    <div className="rounded-2xl border border-border bg-muted/25 p-2 shadow-sm">
      <label htmlFor={id} className="sr-only">
        System prompt
      </label>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        spellCheck
        placeholder="Teach your AI assistant how to behave. Describe its role, tone, boundaries, call goals, escalation rules, and anything it must never say."
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'min-h-[520px] w-full resize-y scroll-smooth rounded-xl border border-transparent bg-background/80 px-5 py-4 text-[0.95rem] leading-7 text-foreground shadow-inner outline-none transition',
          'placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-3 focus:ring-ring/20',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 text-xs text-muted-foreground">
        <span>Plain-language assistant instructions</span>
        <span>{characterCount} characters</span>
      </div>
    </div>
  );
}
