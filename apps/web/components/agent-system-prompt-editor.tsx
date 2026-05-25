'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';
import { VersionPromptDiff } from './version-prompt-diff';

export interface AgentSystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  statusLabel?: string;
  updatedLabel?: string;
  helperLabel?: string;
  viewMode?: 'edit' | 'diff';
  oldValue?: string;
}

export function AgentSystemPromptEditor({
  value,
  onChange,
  disabled = false,
  helperLabel,
  viewMode = 'edit',
  oldValue = '',
}: AgentSystemPromptEditorProps) {
  const id = useId();
  const characterCount = value.length.toLocaleString();

  return (
    <div className="w-full flex flex-col rounded-xl border border-border/30 bg-background shadow-sm transition-all focus-within:border-primary/30 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.04)] h-[calc(100vh-130px)] min-h-[500px] overflow-hidden">
      <label htmlFor={id} className="sr-only">
        System prompt
      </label>
      <div className="flex-1 min-h-0 relative">
        {viewMode === 'diff' ? (
          <div className="h-full w-full overflow-y-auto px-4 py-3 bg-muted/[0.01]">
            <VersionPromptDiff oldValue={oldValue} newValue={value} />
          </div>
        ) : (
          <textarea
            id={id}
            value={value}
            disabled={disabled}
            spellCheck
            placeholder="Teach your AI assistant how to behave. Describe its role, tone, boundaries, call goals, escalation rules, and anything it must never say."
            onChange={(event) => onChange(event.target.value)}
            className={cn(
              'h-full w-full resize-none overflow-y-auto bg-transparent px-6 py-5 text-[13.5px] leading-[1.85] tracking-[-0.01em] text-foreground outline-none transition-all',
              'placeholder:text-muted-foreground/45 placeholder:leading-[1.85]',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'font-[system-ui,-apple-system,BlinkMacSystemFont,"Segoe_UI",Roboto,sans-serif]',
            )}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-border/20 bg-muted/[0.02] text-[10px] text-muted-foreground/70 shrink-0 select-none">
        <span>{helperLabel ?? 'Use plain language. Write goals, tone, boundaries, and escalation rules.'}</span>
        <span className="tabular-nums font-medium">{characterCount} chars</span>
      </div>
    </div>
  );
}
