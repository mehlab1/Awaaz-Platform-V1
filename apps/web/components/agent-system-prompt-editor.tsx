'use client';

import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(
  async () => (await import('@monaco-editor/react')).default,
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[420px] animate-pulse rounded-md border border-border bg-muted/50"
        aria-hidden
      />
    ),
  },
);

export interface AgentSystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function AgentSystemPromptEditor({
  value,
  onChange,
}: AgentSystemPromptEditorProps) {
  return (
    <MonacoEditor
      height="420px"
      defaultLanguage="plaintext"
      theme="vs-dark"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        minimap: { enabled: false },
        wordWrap: 'on',
        fontSize: 13,
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}
