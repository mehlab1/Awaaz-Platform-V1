'use client';

import Link from 'next/link';

import { OrgProvider } from '@/components/org-context';
import { OrgSwitcher } from '@/components/org-switcher';
import { Badge } from '@/components/ui/badge';

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgProvider>
      <div className="flex min-h-screen">
        <aside className="flex w-56 flex-col gap-4 border-r border-border bg-muted/30 p-4">
          <Link href="/agents" className="text-lg font-semibold">
            Awaaz
          </Link>
          <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
            <Link href="/agents" className="text-foreground hover:underline">
              Agents
            </Link>
            <Link href="/calls" className="text-foreground hover:underline">
              Calls
            </Link>
            <Link
              href="/qualicall"
              className="flex items-center gap-2 text-foreground hover:underline"
            >
              Qualicall
              <Badge variant="secondary">Soon</Badge>
            </Link>
          </nav>
          <div className="mt-auto">
            <OrgSwitcher />
          </div>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </OrgProvider>
  );
}
