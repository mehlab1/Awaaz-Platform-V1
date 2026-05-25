'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Sparkles,
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

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/analytics', label: 'Analytics', icon: Activity },
      { href: '/agents', label: 'Agents', icon: Bot },
      { href: '/calls', label: 'Calls', icon: PhoneCall },
      { href: '/phone-numbers', label: 'Phone Numbers', icon: Hash },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/qualicall', label: 'Qualicall', icon: ClipboardCheck },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/settings/members', label: 'Members', icon: Users },
      { href: '/settings/api-keys', label: 'API Keys', icon: KeyRound },
      { href: '/settings/organization', label: 'Organization', icon: Building2 },
    ],
  },
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
            'fixed inset-y-0 left-0 z-40 hidden h-screen flex-col border-r border-border/40 bg-card/[0.45] backdrop-blur-md transition-[width] duration-200 ease-out md:flex',
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
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
              <Sparkles className="size-3.5" />
            </div>
            <span className="font-bold text-sm tracking-tight text-foreground">
              Awaaz
            </span>
          </div>
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
        'flex h-full min-h-0 flex-col gap-4 p-4',
        collapsed && 'items-center gap-3 p-3',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-2',
          collapsed ? 'flex-col gap-3' : 'justify-between',
        )}
      >
        <Link
          href="/agents"
          title="Awaaz"
          onClick={onNavigate}
          className={cn(
            'inline-flex min-w-0 items-center rounded-xl outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring',
            collapsed ? 'size-9 justify-center' : 'px-1',
          )}
        >
          {collapsed ? (
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm hover:scale-105 transition-transform duration-200">
              <Sparkles className="size-4.5" />
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-md">
                <Sparkles className="size-4" />
              </div>
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Awaaz
              </span>
            </div>
          )}
        </Link>
        {onToggleCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        ) : null}
      </div>

      <nav
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-0.5 text-sm scrollbar-thin',
          collapsed && 'items-center gap-3',
        )}
        aria-label="Dashboard navigation"
      >
        {navGroups.map((group, groupIdx) => (
          <div key={group.title} className="w-full space-y-1.5">
            {!collapsed ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/45 px-3 block">
                {group.title}
              </span>
            ) : groupIdx > 0 ? (
              <div className="h-[1px] bg-border/40 my-1 w-8 mx-auto" />
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  active={isActivePath(pathname, item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="w-full shrink-0 border-t border-border/40 pt-4">
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
  const router = useRouter();
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      onClick={onNavigate}
      onMouseEnter={() => router.prefetch(item.href)}
      onFocus={() => router.prefetch(item.href)}
      className={cn(
        'group flex shrink-0 items-center rounded-lg text-muted-foreground transition-all duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary/[0.08] font-semibold text-primary shadow-[0_1px_2px_rgba(0,0,0,0.01)]'
          : 'hover:bg-muted/65',
        collapsed
          ? 'size-9 justify-center'
          : 'h-9.5 w-full justify-between gap-2 px-3',
      )}
    >
      <span
        className={cn(
          'flex min-w-0 items-center gap-2.5',
          collapsed && 'justify-center',
        )}
      >
        <Icon className={cn("size-4 shrink-0 transition-transform duration-200 group-hover:scale-105", active ? "text-primary" : "text-muted-foreground/80")} />
        <span className={cn('truncate', collapsed && 'sr-only')}>
          {item.label}
        </span>
      </span>
      {!collapsed && item.badge ? (
        <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
