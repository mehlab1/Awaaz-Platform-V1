'use client';

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';

import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  PhoneCall,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOnboarding, type OnboardingStepId } from './onboarding-provider';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const stepIcons: Record<OnboardingStepId, LucideIcon> = {
  welcome: Sparkles,
  organization: Building2,
  agent: Bot,
  testCall: PhoneCall,
};
const WELCOME_START_BUTTON_ID = 'awaaz-onboarding-start';

export function OnboardingSurface() {
  const onboarding = useOnboarding();
  const currentTarget = onboarding.currentStep?.target ?? null;
  const spotlight = useSpotlightRect(currentTarget);
  const allComplete =
    onboarding.isActive &&
    onboarding.steps.every((step) => step.completed);

  if (onboarding.isEligible) {
    return (
      <WelcomePanel
        onStart={onboarding.start}
        onDismiss={onboarding.dismiss}
      />
    );
  }

  if (!onboarding.isActive) {
    return null;
  }

  return (
    <>
      <SpotlightOverlay rect={spotlight} />
      {onboarding.currentStep ? (
        <ContextualTooltip
          rect={spotlight}
          title={onboarding.currentStep.title}
          description={onboarding.currentStep.description}
          onAction={onboarding.runCurrentStepAction}
        />
      ) : null}
      <ChecklistCard allComplete={allComplete} />
    </>
  );
}

function WelcomePanel({
  onStart,
  onDismiss,
}: {
  onStart: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.getElementById(WELCOME_START_BUTTON_ID)?.focus();
    }, 120);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-background/70 px-4 py-8 backdrop-blur-md animate-in fade-in duration-300">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="awaaz-onboarding-welcome-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl shadow-black/[0.08] animate-in zoom-in-95 slide-in-from-bottom-3 duration-300"
      >
        <div className="border-b border-border/50 bg-muted/25 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-background shadow-sm">
                <Sparkles className="size-5 text-foreground" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Welcome to Awaaz
                </p>
                <h2
                  id="awaaz-onboarding-welcome-title"
                  className="mt-1 text-xl font-semibold tracking-tight text-foreground"
                >
                  Build your first working agent
                </h2>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss onboarding"
              onClick={onDismiss}
              className="shrink-0 rounded-full"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
          <p className="max-w-lg text-sm leading-6 text-muted-foreground">
            We will guide you through the few actions that matter: create a
            workspace, add your first voice agent, then run a browser test call.
            The product stays usable while the guidance follows along.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['01', 'Workspace'],
              ['02', 'Agent'],
              ['03', 'Test call'],
            ].map(([number, label]) => (
              <div
                key={label}
                className="rounded-xl border border-border/70 bg-background px-3 py-3"
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {number}
                </span>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onDismiss}
              className="h-9"
            >
              Not now
            </Button>
            <Button
              id={WELCOME_START_BUTTON_ID}
              type="button"
              onClick={onStart}
              className="h-9 px-4"
            >
              Start guided setup
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChecklistCard({ allComplete }: { allComplete: boolean }) {
  const onboarding = useOnboarding();

  if (onboarding.checklistCollapsed) {
    return (
      <button
        type="button"
        onClick={() => onboarding.setChecklistCollapsed(false)}
        className="fixed bottom-3 left-3 right-3 z-[230] flex items-center justify-between rounded-xl border border-border/80 bg-card/95 px-4 py-3 text-left shadow-xl shadow-black/[0.06] backdrop-blur-md transition-all duration-200 hover:border-border sm:left-auto sm:right-4 sm:w-80"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">
            Getting Started
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {onboarding.progress}% complete
          </span>
        </span>
        <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
      </button>
    );
  }

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-3 left-3 right-3 z-[230] rounded-2xl border border-border/80 bg-card/95 shadow-2xl shadow-black/[0.08] backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300 sm:left-auto sm:right-4 sm:w-[23rem]"
    >
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Getting Started
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {allComplete
                ? 'Nice. Your first agent is ready.'
                : `${onboarding.progress}% complete`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse checklist"
              onClick={() => onboarding.setChecklistCollapsed(true)}
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss onboarding"
              onClick={onboarding.dismiss}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-500 ease-out"
            style={{ width: `${onboarding.progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-1 px-3 py-3">
        {onboarding.steps.map((step) => {
          const Icon = stepIcons[step.id];
          const active = onboarding.currentStep?.id === step.id;
          return (
            <div
              key={step.id}
              className={cn(
                'flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-200',
                active && 'bg-muted/70',
              )}
            >
              <div
                className={cn(
                  'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-300',
                  step.completed
                    ? 'border-foreground bg-foreground text-background'
                    : active
                      ? 'border-foreground/40 bg-background text-foreground'
                      : 'border-border bg-background text-muted-foreground',
                )}
              >
                {step.completed ? (
                  <Check className="size-3.5" aria-hidden />
                ) : active ? (
                  <Icon className="size-3.5" aria-hidden />
                ) : (
                  <Circle className="size-2.5 fill-current" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-5 text-foreground">
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {!allComplete ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 py-3">
          <p className="min-w-0 text-xs leading-5 text-muted-foreground">
            Follow the highlighted action, or use the checklist to continue.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onboarding.runCurrentStepAction}
            className="h-8 shrink-0"
          >
            Continue
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="border-t border-border/50 px-4 py-3 text-sm font-medium text-foreground">
          Completing setup...
        </div>
      )}
    </aside>
  );
}

function SpotlightOverlay({ rect }: { rect: SpotlightRect | null }) {
  if (!rect) {
    return null;
  }

  const style: CSSProperties = {
    top: rect.top - 8,
    left: rect.left - 8,
    width: rect.width + 16,
    height: rect.height + 16,
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[220] rounded-2xl border border-white/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.22),0_18px_60px_rgba(15,23,42,0.18),0_0_0_1px_rgba(255,255,255,0.55)] transition-[top,left,width,height,opacity] duration-300 ease-out awaaz-spotlight"
      style={style}
    />
  );
}

function ContextualTooltip({
  rect,
  title,
  description,
  onAction,
}: {
  rect: SpotlightRect | null;
  title: string;
  description: string;
  onAction: () => void;
}) {
  const style = useMemo<CSSProperties>(() => tooltipStyle(rect), [rect]);

  return (
    <div
      className="fixed z-[225] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border/80 bg-card/95 p-4 shadow-2xl shadow-black/[0.08] backdrop-blur-md transition-all duration-300 ease-out animate-in fade-in zoom-in-95 sm:w-80"
      style={style}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" onClick={onAction} className="h-8">
          Go
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function useSpotlightRect(target: string | null): SpotlightRect | null {
  const pathname = usePathname();
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return undefined;
    }

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const element = findVisibleTarget(target);
        if (!element) {
          setRect(null);
          return;
        }
        const next = element.getBoundingClientRect();
        setRect({
          top: next.top,
          left: next.left,
          width: next.width,
          height: next.height,
        });
      });
    };

    update();
    const interval = window.setInterval(update, 700);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [pathname, target]);

  return rect;
}

function findVisibleTarget(target: string): Element | null {
  const elements = Array.from(
    document.querySelectorAll(`[data-onboarding-target="${target}"]`),
  );
  return (
    elements.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    }) ?? null
  );
}

function tooltipStyle(rect: SpotlightRect | null): CSSProperties {
  if (typeof window === 'undefined' || window.innerWidth < 640) {
    return {
      bottom: 112,
      left: 12,
      right: 12,
    };
  }

  if (!rect) {
    return {
      right: 16,
      bottom: 176,
    };
  }

  const gap = 14;
  const width = 320;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const placeRight = rect.left + rect.width + gap + width < viewportWidth - 16;
  const left = placeRight
    ? rect.left + rect.width + gap
    : Math.max(16, rect.left - width - gap);
  const top = Math.min(
    Math.max(16, rect.top + rect.height / 2 - 70),
    viewportHeight - 180,
  );

  return {
    left,
    top,
    width,
  };
}
