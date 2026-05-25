'use client';

import { useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  Building2,
  ClipboardCheck,
  Hash,
  KeyRound,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Users,
  type LucideIcon,
} from 'lucide-react';
import useLocalStorageState from 'use-local-storage-state';

import { OrgProvider } from '@/components/org-context';
import { OrgSwitcher } from '@/components/org-switcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const navItems: NavItem[] = [
  { href: '/analytics', label: 'Analytics', icon: Activity },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/calls', label: 'Calls', icon: PhoneCall },
  { href: '/phone-numbers', label: 'Phone Numbers', icon: Hash },
  { href: '/settings/members', label: 'Members', icon: Users },
  { href: '/settings/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/settings/organization', label: 'Organization', icon: Building2 },
  { href: '/qualicall', label: 'Qualicall', icon: ClipboardCheck },
];

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState(
    'awaaz-dashboard-sidebar-collapsed',
    { defaultValue: false },
  );

  return (
    <OrgProvider>
      <div className="min-h-screen bg-background md:h-screen md:overflow-hidden">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden h-screen flex-col border-r border-border/70 bg-muted/20 transition-[width] duration-200 ease-out md:flex',
            sidebarCollapsed ? 'w-16' : 'w-56',
          )}
        >
          <SidebarContent
            collapsed={sidebarCollapsed}
            pathname={pathname}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          />
        </aside>

        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open sidebar"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu />
          </Button>
          <Link href="/agents" className="font-semibold">
            Awaaz
          </Link>
        </div>

        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent
            side="left"
            showCloseButton
            className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-0"
          >
            <SheetTitle className="sr-only">Dashboard navigation</SheetTitle>
            <SidebarContent
              collapsed={false}
              pathname={pathname}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <main
          className={cn(
            'min-w-0 p-4 sm:p-6 md:h-screen md:overflow-y-auto md:p-7 md:transition-[margin-left] md:duration-200 md:ease-out',
            sidebarCollapsed ? 'md:ml-16' : 'md:ml-56',
          )}
        >
          {children}
        </main>
      </div>
    </OrgProvider>
  );
}

function SidebarContent({
  collapsed,
  pathname,
  onNavigate,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col gap-3.5 p-3.5',
        collapsed && 'items-center gap-2.5 p-2.5',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-2',
          collapsed ? 'flex-col' : 'justify-between',
        )}
      >
        <Link
          href="/agents"
          title="Awaaz"
          onClick={onNavigate}
          className={cn(
            'inline-flex min-w-0 items-center rounded-md font-semibold text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring',
            collapsed ? 'size-9 justify-center bg-background shadow-sm' : 'px-1 text-lg',
          )}
        >
          {collapsed ? (
            <>
              <span aria-hidden>A</span>
              <span className="sr-only">Awaaz</span>
            </>
          ) : (
            'Awaaz'
          )}
        </Link>
        {onToggleCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        ) : null}
      </div>

      <nav
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto text-sm',
          collapsed && 'items-center',
        )}
        aria-label="Dashboard navigation"
      >
        {navItems.map((item) => (
          <SidebarNavLink
            key={item.href}
            item={item}
            active={isActivePath(pathname, item.href)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="w-full shrink-0">
        <OrgSwitcher compact={collapsed} />
      </div>
    </div>
  );
}

function SidebarNavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        'flex shrink-0 items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-background font-medium text-foreground shadow-sm',
        collapsed
          ? 'size-9 justify-center'
          : 'h-9 w-full justify-between gap-2 px-2.5',
      )}
    >
      <span
        className={cn(
          'flex min-w-0 items-center gap-2',
          collapsed && 'justify-center',
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className={cn('truncate', collapsed && 'sr-only')}>
          {item.label}
        </span>
      </span>
      {!collapsed && item.badge ? (
        <Badge variant="secondary">{item.badge}</Badge>
      ) : null}
    </Link>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
