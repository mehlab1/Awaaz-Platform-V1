'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import Link from 'next/link';
import Image from 'next/image';
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
  Receipt,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import useLocalStorageState from 'use-local-storage-state';

import { OnboardingProvider } from '@/components/onboarding/onboarding-provider';
import { OnboardingSurface } from '@/components/onboarding/onboarding-surface';
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

const SIDEBAR_WIDTH_STORAGE_KEY = 'awaaz-dashboard-sidebar-width';
const DEFAULT_SIDEBAR_WIDTH = 272;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 380;
const COLLAPSED_SIDEBAR_WIDTH = 64;
const LOGO_SRC = '/logo.png';

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
      { href: '/settings/billing', label: 'Billing', icon: Receipt },
      { href: '/settings/organization', label: 'Organization', icon: Building2 },
    ],
  },
];

export function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState(
    'awaaz-dashboard-sidebar-collapsed',
    { defaultValue: false },
  );
  const sidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const resizeStartRef = useRef({
    pointerX: 0,
    width: DEFAULT_SIDEBAR_WIDTH,
  });
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const activeSidebarWidth = sidebarCollapsed
    ? COLLAPSED_SIDEBAR_WIDTH
    : sidebarWidth;
  const sidebarOffsetStyle = {
    '--sidebar-offset': `${activeSidebarWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    try {
      const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);

      if (!storedWidth) {
        return;
      }

      const parsedWidth = Number(storedWidth);

      if (!Number.isFinite(parsedWidth)) {
        return;
      }

      const nextWidth = clampSidebarWidth(parsedWidth);
      sidebarWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
    } catch {
      // Local storage can be unavailable in hardened browser contexts.
    }
  }, []);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (sidebarCollapsed && isResizingSidebar) {
      setIsResizingSidebar(false);
    }
  }, [isResizingSidebar, sidebarCollapsed]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const updateWidth = (width: number) => {
      const nextWidth = clampSidebarWidth(width);
      sidebarWidthRef.current = nextWidth;

      if (resizeAnimationFrameRef.current !== null) {
        return;
      }

      resizeAnimationFrameRef.current = window.requestAnimationFrame(() => {
        resizeAnimationFrameRef.current = null;
        setSidebarWidth(sidebarWidthRef.current);
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      updateWidth(
        resizeStartRef.current.width
          + event.clientX
          - resizeStartRef.current.pointerX,
      );
    };

    const finishResize = () => {
      if (resizeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnimationFrameRef.current);
        resizeAnimationFrameRef.current = null;
      }

      const finalWidth = sidebarWidthRef.current;
      setSidebarWidth(finalWidth);
      persistSidebarWidth(finalWidth);
      setIsResizingSidebar(false);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', finishResize);
    document.addEventListener('pointercancel', finishResize);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', finishResize);
      document.removeEventListener('pointercancel', finishResize);

      if (resizeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnimationFrameRef.current);
        resizeAnimationFrameRef.current = null;
      }

      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingSidebar]);

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (sidebarCollapsed) {
        return;
      }

      event.preventDefault();
      resizeStartRef.current = {
        pointerX: event.clientX,
        width: sidebarWidthRef.current,
      };
      setIsResizingSidebar(true);
    },
    [sidebarCollapsed],
  );

  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (sidebarCollapsed) {
        return;
      }

      const step = event.shiftKey ? 24 : 12;
      let nextWidth: number | undefined;

      if (event.key === 'ArrowLeft') {
        nextWidth = sidebarWidthRef.current - step;
      } else if (event.key === 'ArrowRight') {
        nextWidth = sidebarWidthRef.current + step;
      } else if (event.key === 'Home') {
        nextWidth = MIN_SIDEBAR_WIDTH;
      } else if (event.key === 'End') {
        nextWidth = MAX_SIDEBAR_WIDTH;
      }

      if (nextWidth === undefined) {
        return;
      }

      event.preventDefault();
      const clampedWidth = clampSidebarWidth(nextWidth);
      sidebarWidthRef.current = clampedWidth;
      setSidebarWidth(clampedWidth);
      persistSidebarWidth(clampedWidth);
    },
    [sidebarCollapsed],
  );

  return (
    <OrgProvider>
      <OnboardingProvider>
        <div className="min-h-screen bg-background md:h-screen md:overflow-hidden">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden h-screen flex-col border-r border-border/40 bg-card/[0.45] backdrop-blur-md transition-[width] duration-[220ms] ease-out will-change-[width] md:flex',
            isResizingSidebar && 'transition-none',
          )}
          style={{ width: activeSidebarWidth }}
        >
          <SidebarContent
            collapsed={sidebarCollapsed}
            pathname={pathname}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          />
          {!sidebarCollapsed ? (
            <SidebarResizeHandle
              width={sidebarWidth}
              resizing={isResizingSidebar}
              onPointerDown={handleResizeStart}
              onKeyDown={handleResizeKeyDown}
            />
          ) : null}
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
            <LogoMark className="size-7 rounded-lg" iconClassName="size-3.5" />
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
            'min-w-0 p-4 sm:p-6 md:ml-[var(--sidebar-offset)] md:h-screen md:overflow-y-auto md:p-7 md:transition-[margin-left] md:duration-[220ms] md:ease-out md:will-change-[margin-left]',
            isResizingSidebar && 'md:transition-none',
          )}
          style={sidebarOffsetStyle}
        >
          {children}
        </main>
        <OnboardingSurface />
        </div>
      </OnboardingProvider>
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
          'w-full shrink-0 border-b border-border/40 pb-3',
          collapsed
            ? 'flex flex-col items-center gap-2'
            : 'flex h-11 items-center gap-2',
        )}
      >
        <Link
          href="/agents"
          title="Awaaz"
          onClick={onNavigate}
          className={cn(
            'inline-flex min-w-0 items-center rounded-xl outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring',
            collapsed ? 'size-10 justify-center' : 'min-w-0 flex-1 gap-3 px-1 py-1',
          )}
        >
          <LogoMark
            className={cn('size-9', collapsed && 'hover:scale-105')}
            iconClassName="size-4"
          />
          <span
            aria-hidden={collapsed}
            className={cn(
              'min-w-0 overflow-hidden whitespace-nowrap text-lg font-bold tracking-tight text-foreground transition-opacity duration-150 ease-out',
              collapsed ? 'w-0 opacity-0' : 'opacity-100',
            )}
          >
            Awaaz
          </span>
        </Link>
        {onToggleCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        'group flex shrink-0 items-center rounded-lg border border-transparent text-muted-foreground transition-[background-color,border-color,color,box-shadow,width] duration-200 ease-out hover:border-border/60 hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-border/80 bg-muted/85 font-semibold text-foreground shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted'
          : '',
        collapsed
          ? 'size-9 justify-center'
          : 'h-9.5 w-full justify-between gap-2 px-3',
      )}
    >
      <span
        className={cn(
          'flex min-w-0 items-center',
          collapsed ? 'justify-center gap-0' : 'gap-2.5',
        )}
      >
        <Icon className={cn("size-4 shrink-0 transition-transform duration-200 group-hover:scale-105", active ? "text-foreground" : "text-muted-foreground/80")} />
        <span
          aria-hidden={collapsed}
          className={cn(
            'min-w-0 truncate whitespace-nowrap transition-opacity duration-150 ease-out',
            collapsed ? 'w-0 opacity-0' : 'opacity-100',
          )}
        >
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

function SidebarResizeHandle({
  width,
  resizing,
  onPointerDown,
  onKeyDown,
}: {
  width: number;
  resizing: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'group absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors md:flex',
        resizing
          ? 'bg-foreground/[0.03]'
          : 'hover:bg-muted/50 focus-visible:bg-muted/70',
      )}
    >
      <span
        className={cn(
          'h-12 w-px rounded-full bg-border transition-colors',
          resizing ? 'bg-foreground/30' : 'group-hover:bg-foreground/20',
        )}
      />
    </div>
  );
}

function LogoMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  const [logoState, setLogoState] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center transition-transform duration-200',
        className,
      )}
    >
      {logoState !== 'error' ? (
        <Image
          src={LOGO_SRC}
          alt=""
          aria-hidden="true"
          fill
          sizes="36px"
          unoptimized
          draggable={false}
          onLoad={() => setLogoState('loaded')}
          onError={() => setLogoState('error')}
          className={cn(
            'absolute inset-0 h-full w-full object-contain transition-opacity duration-150',
            logoState === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Sparkles className={cn('size-4', iconClassName)} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

function clampSidebarWidth(width: number) {
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
  );
}

function persistSidebarWidth(width: number) {
  try {
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(clampSidebarWidth(width)),
    );
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}
