'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from 'react';

import { Check, ChevronDown, Loader2 } from 'lucide-react';

import { useOrgContext } from '@/components/org-context';
import { CreateOrganizationDialog } from '@/components/create-organization-dialog';
import {
  OrganizationAvatar,
  getOrganizationInitials,
} from '@/components/organization-avatar';
import { cn } from '@/lib/utils';

interface OrgSwitcherProps {
  compact?: boolean;
}

export function OrgSwitcher({ compact = false }: OrgSwitcherProps) {
  const {
    orgs,
    activeOrgId,
    setActiveOrgId,
    loadingOrgs,
  } = useOrgContext();
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeOrg = orgs.find((org) => org.id === activeOrgId);
  const title = activeOrg?.name ?? activeOrgId ?? 'No organization selected';
  const disabled = loadingOrgs || switching;
  const activeIndex = Math.max(
    0,
    orgs.findIndex((org) => org.id === activeOrgId),
  );
  const displayName = loadingOrgs
    ? 'Loading...'
    : switching
      ? 'Switching...'
      : activeOrg?.name ?? 'No organization selected';

  useEffect(() => {
    if (!loadingOrgs) {
      setSwitching(false);
    }
  }, [loadingOrgs, activeOrgId]);

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, orgs.length);
  }, [orgs.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const focusOption = useCallback(
    (index: number) => {
      if (orgs.length === 0) {
        return;
      }

      const nextIndex = (index + orgs.length) % orgs.length;
      optionRefs.current[nextIndex]?.focus();
    },
    [orgs.length],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => focusOption(activeIndex));

    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, focusOption, open]);

  const toggleMenu = useCallback(() => {
    if (disabled || orgs.length === 0) {
      return;
    }

    setOpen((value) => !value);
  }, [disabled, orgs.length]);

  const handleSelectOrg = useCallback(
    (orgId: string) => {
      if (disabled) {
        return;
      }

      setOpen(false);

      if (orgId === activeOrgId) {
        return;
      }

      setSwitching(true);
      setActiveOrgId(orgId);
    },
    [activeOrgId, disabled, setActiveOrgId],
  );

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (disabled || orgs.length === 0) {
      return;
    }

    if (
      event.key === 'ArrowDown'
      || event.key === 'ArrowUp'
      || event.key === 'Enter'
      || event.key === ' '
    ) {
      event.preventDefault();
      setOpen(true);
      const nextIndex = event.key === 'ArrowUp' ? orgs.length - 1 : activeIndex;
      window.requestAnimationFrame(() => focusOption(nextIndex));
    }
  };

  const handleOptionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(orgs.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  if (compact) {
    return (
      <div
        ref={rootRef}
        className="relative w-full text-xs"
        title={title}
      >
        <span className="sr-only">Organization</span>
        {orgs.length > 0 ? (
          <button
            ref={triggerRef}
            type="button"
            className="flex h-9 w-full items-center justify-center rounded-lg border border-border/70 bg-background/80 text-[11px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Switch organization: ${title}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            disabled={disabled}
            onClick={toggleMenu}
            onKeyDown={handleTriggerKeyDown}
          >
            {disabled ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : (
              getOrganizationInitials(activeOrg?.name ?? activeOrgId)
            )}
          </button>
        ) : (
          <div className="flex h-9 w-full items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/70 text-[10px] font-semibold text-muted-foreground">
            Org
          </div>
        )}
        <OrganizationMenu
          activeOrgId={activeOrgId}
          disabled={disabled}
          menuId={menuId}
          open={open}
          orgs={orgs}
          optionRefs={optionRefs}
          compact
          onOptionKeyDown={handleOptionKeyDown}
          onSelectOrg={handleSelectOrg}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative rounded-lg border border-border/60 bg-background/80 p-2.5 text-sm shadow-sm backdrop-blur"
    >
      <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55">
        Organization
      </div>
      {orgs.length > 0 ? (
        <button
          ref={triggerRef}
          type="button"
          className="mt-2 flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border/70 bg-card/70 px-2.5 text-left shadow-sm transition-colors hover:border-border hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
          aria-label="Switch organization"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={disabled}
          onClick={toggleMenu}
          onKeyDown={handleTriggerKeyDown}
        >
          <OrganizationAvatar
            name={activeOrg?.name ?? activeOrgId}
            className="size-7"
            textClassName="text-[10px]"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-foreground" title={title}>
              {displayName}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {disabled ? 'Please wait' : 'Current workspace'}
            </span>
          </span>
          {disabled ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          )}
        </button>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-border/70 bg-card/60 px-2.5 py-2">
          <div className="truncate text-xs font-semibold text-foreground">
            {loadingOrgs ? 'Loading...' : 'No organization selected'}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Create a workspace to begin
          </div>
        </div>
      )}
      <OrganizationMenu
        activeOrgId={activeOrgId}
        disabled={disabled}
        menuId={menuId}
        open={open}
        orgs={orgs}
        optionRefs={optionRefs}
        onOptionKeyDown={handleOptionKeyDown}
        onSelectOrg={handleSelectOrg}
      />
      <div className="mt-2" onClick={() => setOpen(false)}>
        <CreateOrganizationDialog
          variant="outline"
          buttonLabel={orgs.length > 0 ? 'New organization' : 'Create organization'}
          buttonSize="sm"
          buttonClassName="h-8 w-full justify-center rounded-md border-border/70 bg-background/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        />
      </div>
    </div>
  );
}

function OrganizationMenu({
  activeOrgId,
  compact = false,
  disabled,
  menuId,
  open,
  orgs,
  optionRefs,
  onOptionKeyDown,
  onSelectOrg,
}: {
  activeOrgId: string | undefined;
  compact?: boolean;
  disabled: boolean;
  menuId: string;
  open: boolean;
  orgs: Array<{ id: string; name: string }>;
  optionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  onOptionKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => void;
  onSelectOrg: (orgId: string) => void;
}) {
  if (!open || orgs.length === 0) {
    return null;
  }

  return (
    <div
      id={menuId}
      role="listbox"
      aria-label="Organizations"
      className={cn(
        'absolute bottom-full z-50 mb-2 max-h-60 overflow-y-auto rounded-lg border border-border/70 bg-popover p-1.5 text-sm text-popover-foreground shadow-lg',
        compact ? 'left-0 w-60' : 'left-0 right-0',
      )}
    >
      {orgs.map((org, index) => {
        const selected = org.id === activeOrgId;

        return (
          <button
            key={org.id}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            className={cn(
              'flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60',
              selected
                ? 'bg-muted font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
            onClick={() => onSelectOrg(org.id)}
            onKeyDown={(event) => onOptionKeyDown(event, index)}
          >
            <span className="min-w-0 truncate">{org.name}</span>
            <Check
              className={cn(
                'size-3.5 shrink-0 text-foreground transition-opacity',
                selected ? 'opacity-100' : 'opacity-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
