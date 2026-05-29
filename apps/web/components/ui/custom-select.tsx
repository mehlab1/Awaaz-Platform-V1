'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Check, ChevronDown, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface CustomSelectOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  searchLabel?: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
}

export function CustomSelect({
  value,
  options,
  onValueChange,
  placeholder = 'Select option',
  disabled = false,
  loading = false,
  ariaLabel,
  className,
  buttonClassName,
  menuClassName,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const reactId = useId();
  const listboxId = `custom-select-${reactId.replace(/:/g, '')}`;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const isDisabled = disabled || loading || options.length === 0;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        rootRef.current &&
        !rootRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));
    }
  }, [open, options, selectedIndex]);

  const selectOption = (option: CustomSelectOption) => {
    if (option.disabled) {
      return;
    }
    onValueChange?.(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const moveHighlight = (direction: 1 | -1) => {
    const enabledIndexes = options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled)
      .map(({ index }) => index);

    if (enabledIndexes.length === 0) {
      return;
    }

    const currentEnabledIndex = enabledIndexes.indexOf(highlightedIndex);
    const nextIndex =
      currentEnabledIndex === -1
        ? enabledIndexes[0]!
        : enabledIndexes[
            (currentEnabledIndex + direction + enabledIndexes.length) %
              enabledIndexes.length
          ]!;
    setHighlightedIndex(nextIndex);
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = options[highlightedIndex];
      if (option) {
        selectOption(option);
      }
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={isDisabled}
        disabled={isDisabled}
        className={cn(
          'flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm shadow-sm outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          buttonClassName,
        )}
        onClick={() => setOpen((current) => (isDisabled ? false : !current))}
        onKeyDown={onButtonKeyDown}
      >
        <span className="min-w-0 flex-1 truncate">
          {loading ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        {loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        )}
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            'absolute left-0 right-0 top-full z-[80] mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none',
            menuClassName,
          )}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const highlighted = index === highlightedIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                  highlighted || selected
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  option.disabled && 'cursor-not-allowed opacity-50',
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(option)}
              >
                <Check
                  className={cn(
                    'mt-0.5 size-3.5 shrink-0 text-foreground',
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function firstEnabledIndex(options: CustomSelectOption[]): number {
  return options.findIndex((option) => !option.disabled);
}
