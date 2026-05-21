'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { OrgProvider } from '@/components/org-context';
import { OrgSwitcher } from '@/components/org-switcher';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  badge?: string;
}

const navItems: NavItem[] = [
  { href: '/analytics', label: 'Analytics' },
  { href: '/agents', label: 'Agents' },
  { href: '/calls', label: 'Calls' },
  { href: '/phone-numbers', label: 'Phone Numbers' },
  { href: '/settings/members', label: 'Members' },
  { href: '/settings/api-keys', label: 'API Keys' },
  { href: '/settings/organization', label: 'Organization' },
  { href: '/qualicall', label: 'Qualicall' },
];

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <OrgProvider>
      <div className="flex min-h-screen">
        <aside className="flex w-56 flex-col gap-4 border-r border-border bg-muted/30 p-4">
          <Link href="/agents" className="text-lg font-semibold">
            Awaaz
          </Link>
          <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-muted',
                  isActivePath(pathname, item.href) && 'bg-muted font-medium',
                )}
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <Badge variant="secondary">{item.badge}</Badge>
                ) : null}
              </Link>
            ))}
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

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
