'use client';

import dynamic from 'next/dynamic';

export interface VersionPromptDiffProps {
  oldValue: string;
  newValue: string;
}

const ReactDiffViewer = dynamic(
  () => import('react-diff-viewer-continued').then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <p className="py-10 text-center text-muted-foreground text-sm">
        Loading diff…
      </p>
    ),
  },
);

export function VersionPromptDiff({
  oldValue,
  newValue,
}: VersionPromptDiffProps) {
  return (
    <div className="max-h-[min(560px,calc(100vh-12rem))] overflow-auto rounded-lg border border-border/60 bg-muted/20 p-2 [&_.diff-viewer-wrapper]:font-mono [&_.diff-viewer-wrapper]:text-xs">
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView
        hideLineNumbers={false}
        showDiffOnly={false}
        disableWorker
      />
    </div>
  );
}
