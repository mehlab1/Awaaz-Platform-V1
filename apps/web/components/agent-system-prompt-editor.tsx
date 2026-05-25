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
  helperLabel,
}: AgentSystemPromptEditorProps) {
  const id = useId();
  const characterCount = value.length.toLocaleString();

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
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
          'min-h-[480px] flex-1 w-full resize-y scroll-smooth rounded-xl bg-background px-6 py-5 text-[13.5px] leading-[1.85] tracking-[-0.01em] text-foreground outline-none transition-all',
          'border border-border/30 shadow-sm',
          'placeholder:text-muted-foreground/50 placeholder:leading-[1.85]',
          'focus:border-primary/40 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] focus:bg-background',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'font-[system-ui,-apple-system,BlinkMacSystemFont,"Segoe_UI",Roboto,sans-serif]',
        )}
      />
      <div className="flex items-center justify-between gap-3 px-1 pt-2 text-[10px] text-muted-foreground/70">
        <span>{helperLabel ?? 'Use plain language. Write goals, tone, boundaries, and escalation rules.'}</span>
        <span className="tabular-nums">{characterCount} chars</span>
      </div>
    </div>
  );
}
