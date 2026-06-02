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
  Key,
  Lightbulb,
  PenLine,
  PhoneCall,
  Rocket,
  ShieldCheck,
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
  agentBlueprints: Lightbulb,
  agentPrompt: PenLine,
  apiKeysMode: ShieldCheck,
  apiKeys: Key,
  publishVersion: Rocket,
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
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (allComplete && onboarding.status !== 'completed') {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [allComplete, onboarding.status]);

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
      {showConfetti && <ConfettiCelebration />}
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
    <div className="fixed inset-0 z-[240] flex items-center justify-center px-4 py-8 bg-background/80 backdrop-blur-xl animate-in fade-in duration-500">
      {/* Animated gradient mesh background */}
      <div 
        className="absolute inset-0 opacity-20 dark:opacity-10 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, var(--primary) 0%, transparent 50%), radial-gradient(circle at 100% 0%, var(--accent) 0%, transparent 50%), radial-gradient(circle at 0% 100%, var(--secondary) 0%, transparent 50%)',
          backgroundSize: '200% 200%',
          animation: 'onboarding-gradient-shift 15s ease infinite',
        }}
      />
      
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="awaaz-onboarding-welcome-title"
        className="w-full max-w-2xl relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 shadow-[0_0_80px_-20px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-in zoom-in-95 slide-in-from-bottom-8 duration-700 ease-out"
      >
        {/* Subtle glow at the top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        
        <div className="px-8 py-10 sm:px-12 sm:py-12">
          <div className="flex flex-col items-center text-center">
            <div 
              className="grid size-16 place-items-center rounded-2xl border border-border/80 bg-background shadow-xl mb-6"
              style={{ animation: 'onboarding-step-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both' }}
            >
              <Sparkles className="size-8 text-primary" aria-hidden />
            </div>
            
            <h2
              id="awaaz-onboarding-welcome-title"
              className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4"
              style={{ animation: 'onboarding-step-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both' }}
            >
              Build your first <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">working agent</span>
            </h2>
            
            <p 
              className="max-w-lg text-base sm:text-lg text-muted-foreground leading-relaxed mb-10"
              style={{ animation: 'onboarding-step-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both' }}
            >
              We'll guide you through creating a workspace, adding your first voice agent, and running a live browser test call in minutes.
            </p>

            <div className="grid w-full gap-4 sm:grid-cols-3 mb-10">
              {[
                { number: '01', label: 'Create Workspace', icon: Building2, delay: '0.3s' },
                { number: '02', label: 'Configure Agent', icon: Bot, delay: '0.4s' },
                { number: '03', label: 'Run Test Call', icon: PhoneCall, delay: '0.5s' },
              ].map((step) => (
                <div
                  key={step.label}
                  className="group flex flex-col items-center rounded-2xl border border-border/40 bg-background/40 p-5 transition-all duration-300 hover:bg-background/80 hover:scale-105 hover:shadow-lg"
                  style={{ animation: `onboarding-step-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${step.delay} both` }}
                >
                  <step.icon className="size-6 text-muted-foreground mb-3 group-hover:text-primary transition-colors duration-300" />
                  <span className="font-mono text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1">
                    Step {step.number}
                  </span>
                  <p className="text-sm font-semibold text-foreground text-center">
                    {step.label}
                  </p>
                </div>
              ))}
            </div>

            <div 
              className="flex flex-col w-full sm:flex-row sm:items-center sm:justify-center gap-3"
              style={{ animation: 'onboarding-step-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both' }}
            >
              <Button
                id={WELCOME_START_BUTTON_ID}
                type="button"
                onClick={onStart}
                className="relative h-12 px-8 text-base font-semibold group overflow-hidden rounded-xl"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-white/20 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                Start guided setup
                <ArrowRight className="ml-2 size-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onDismiss}
                className="h-12 px-8 text-base rounded-xl hover:bg-muted/50"
              >
                Skip for now
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 18;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-12 h-12">
      <svg
        height={radius * 2}
        width={radius * 2}
        className="transform -rotate-90"
        style={{
          ['--progress-offset' as string]: strokeDashoffset,
        }}
      >
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          className="text-muted/50"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-primary transition-all duration-700 ease-out"
          style={{
            strokeDasharray: circumference + ' ' + circumference,
            animation: progress > 0 ? 'onboarding-progress-fill 1s ease-out forwards' : 'none',
          }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-foreground">
        {progress}%
      </span>
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
        className="fixed bottom-4 left-4 right-4 z-[230] flex items-center justify-between rounded-2xl border border-border/60 bg-card/80 px-5 py-4 text-left shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:bg-card/95 hover:scale-[1.02] sm:left-auto sm:right-6 sm:w-80"
      >
        <div className="flex items-center gap-4">
          <ProgressRing progress={onboarding.progress} />
          <div>
            <span className="block text-sm font-bold text-foreground tracking-tight">
              Getting Started
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {allComplete ? 'Setup complete!' : 'Continue setup'}
            </span>
          </div>
        </div>
        <ChevronUp className="size-5 text-muted-foreground" aria-hidden />
      </button>
    );
  }

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-[230] flex flex-col rounded-3xl border border-border/60 bg-card/80 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-6 duration-500 sm:left-auto sm:right-6 sm:w-[26rem] overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-border/40 bg-muted/10">
        <div className="flex items-center gap-4">
          <ProgressRing progress={onboarding.progress} />
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-tight text-foreground">
              Getting Started
            </h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {allComplete
                ? 'Great job! Your workspace is ready.'
                : 'Complete these steps to start'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse checklist"
            onClick={() => onboarding.setChecklistCollapsed(true)}
            className="rounded-full hover:bg-muted"
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss onboarding"
            onClick={onboarding.dismiss}
            className="rounded-full hover:bg-muted"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {onboarding.steps.map((step, index) => {
          const Icon = stepIcons[step.id];
          const active = onboarding.currentStep?.id === step.id;
          const isLast = index === onboarding.steps.length - 1;
          
          return (
            <div
              key={step.id}
              className={cn(
                'relative flex items-start gap-4 transition-all duration-300',
                active ? 'opacity-100' : step.completed ? 'opacity-70 hover:opacity-100' : 'opacity-50'
              )}
            >
              {/* Vertical connecting line */}
              {!isLast && (
                <div 
                  className={cn(
                    "absolute left-4 top-10 bottom-[-24px] w-0.5 rounded-full transition-colors duration-500",
                    step.completed ? "bg-primary/50" : "bg-border/50"
                  )} 
                />
              )}

              <div
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500',
                  step.completed
                    ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]'
                    : active
                      ? 'border-primary bg-background text-primary shadow-[0_0_0_4px_rgba(var(--primary),0.1)]'
                      : 'border-border bg-background text-muted-foreground'
                )}
              >
                {step.completed ? (
                  <Check className="size-4" style={{ animation: 'onboarding-check-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both' }} aria-hidden />
                ) : (
                  <Icon className="size-4" aria-hidden />
                )}
                {active && !step.completed && (
                  <span className="absolute inset-0 rounded-full border-2 border-primary" style={{ animation: 'onboarding-glow-pulse 2s infinite' }} />
                )}
              </div>
              
              <div className="min-w-0 flex-1 pt-1.5">
                <p className={cn(
                  "text-sm font-bold leading-none transition-colors",
                  active ? "text-foreground" : "text-foreground/80"
                )}>
                  {step.title}
                </p>
                
                {/* Smooth expanding description area */}
                <div className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                  active ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"
                )}>
                  <div className="overflow-hidden">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                    {active && !step.completed && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={onboarding.runCurrentStepAction}
                        className="mt-3 h-8 w-full font-semibold shadow-sm"
                      >
                        {step.id === 'organization' && 'Create Organization'}
                        {step.id === 'agent' && 'Create Agent'}
                        {step.id === 'agentBlueprints' && 'Explore Blueprints'}
                        {step.id === 'agentPrompt' && 'Write Prompt'}
                        {step.id === 'apiKeysMode' && 'Select Mode'}
                        {step.id === 'apiKeys' && 'Configure Keys'}
                        {step.id === 'publishVersion' && 'Publish Now'}
                        {step.id === 'testCall' && 'Open Test Modal'}
                        {step.id === 'welcome' && 'Continue'}
                        <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {allComplete && (
        <div className="px-6 py-5 border-t border-border/40 bg-primary/5 flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Check className="size-4" />
            <span>Ready to build</span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onboarding.dismiss}
            className="h-8 shadow-sm"
          >
            Close Tutorial
          </Button>
        </div>
      )}
    </aside>
  );
}

function SpotlightOverlay({ rect }: { rect: SpotlightRect | null }) {
  if (!rect) {
    return null;
  }

  const padding = 12;
  const style: CSSProperties = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[220] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5),0_0_40px_rgba(0,0,0,0.3)] transition-all duration-500 ease-out backdrop-blur-[1px]"
      style={style}
    >
      {/* Animated gradient border */}
      <div 
        className="absolute -inset-[2px] rounded-[18px] opacity-70"
        style={{
          background: 'conic-gradient(from 0deg, transparent, var(--primary), transparent)',
          animation: 'onboarding-spotlight-rotate 4s linear infinite',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: '2px',
        }}
      />
    </div>
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
  const pointerStyle = useMemo<CSSProperties>(() => tooltipPointerStyle(rect), [rect]);

  return (
    <div
      className="fixed z-[225] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/60 bg-card/95 p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-all duration-500 ease-out sm:w-80"
      style={style}
    >
      {/* Pointer arrow */}
      <div 
        className="absolute w-4 h-4 bg-card/95 border border-border/60 rotate-45 pointer-events-none transition-all duration-500"
        style={{
          ...pointerStyle,
          borderRightColor: pointerStyle.top === '-9px' ? 'transparent' : 'inherit',
          borderBottomColor: pointerStyle.top === '-9px' ? 'transparent' : 'inherit',
          borderLeftColor: pointerStyle.bottom === '-9px' ? 'transparent' : 'inherit',
          borderTopColor: pointerStyle.bottom === '-9px' ? 'transparent' : 'inherit',
        }}
      />
      
      <div className="relative z-10">
        <h4 className="text-sm font-bold text-foreground mb-1.5">{title}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground mb-4">
          {description}
        </p>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onAction} className="h-8 px-4 font-semibold shadow-sm">
            Execute Step
            <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfettiCelebration() {
  const pieces = 50;
  return (
    <div className="fixed inset-0 z-[300] pointer-events-none overflow-hidden flex justify-center">
      {Array.from({ length: pieces }).map((_, i) => {
        const style = {
          left: `${Math.random() * 100}%`,
          top: `-10%`,
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][Math.floor(Math.random() * 5)],
          width: `${Math.random() * 10 + 5}px`,
          height: `${Math.random() * 10 + 5}px`,
          animation: `onboarding-confetti ${Math.random() * 2 + 2}s linear forwards`,
          animationDelay: `${Math.random() * 0.5}s`,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          position: 'absolute' as const,
        };
        return <div key={i} style={style} />;
      })}
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
    let timeout: NodeJS.Timeout;
    
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const element = findVisibleTarget(target);
        if (!element) {
          setRect(null);
          return;
        }
        const next = element.getBoundingClientRect();
        setRect((prev) => {
          if (!prev) return { top: next.top, left: next.left, width: next.width, height: next.height };
          // Only update if changed significantly to avoid micro-jitters
          if (Math.abs(prev.top - next.top) > 1 || Math.abs(prev.left - next.left) > 1 || 
              Math.abs(prev.width - next.width) > 1 || Math.abs(prev.height - next.height) > 1) {
            return { top: next.top, left: next.left, width: next.width, height: next.height };
          }
          return prev;
        });
      });
    };

    update();
    const interval = window.setInterval(update, 250);
    
    const handleScrollResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(update, 10);
    };

    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      clearTimeout(timeout);
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
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
        style.display !== 'none' &&
        style.opacity !== '0'
      );
    }) ?? null
  );
}

function tooltipStyle(rect: SpotlightRect | null): CSSProperties {
  if (typeof window === 'undefined' || window.innerWidth < 640) {
    return { bottom: 120, left: 16, right: 16 };
  }
  if (!rect) {
    return { right: 24, bottom: 200 };
  }

  const gap = 20;
  const width = 320;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Decide placement: Try Right -> Left -> Bottom -> Top
  const canFitRight = rect.left + rect.width + gap + width < viewportWidth - 24;
  const canFitLeft = rect.left - width - gap > 24;
  
  let left, top;
  
  if (canFitRight) {
    left = rect.left + rect.width + gap;
    top = Math.min(Math.max(24, rect.top + rect.height / 2 - 70), viewportHeight - 180);
  } else if (canFitLeft) {
    left = rect.left - width - gap;
    top = Math.min(Math.max(24, rect.top + rect.height / 2 - 70), viewportHeight - 180);
  } else {
    // Put it below if it doesn't fit on sides
    left = Math.max(24, Math.min(viewportWidth - width - 24, rect.left + rect.width / 2 - width / 2));
    top = rect.top + rect.height + gap;
  }

  return { left, top, width };
}

function tooltipPointerStyle(rect: SpotlightRect | null): CSSProperties {
  if (!rect || typeof window === 'undefined' || window.innerWidth < 640) {
    return { display: 'none' };
  }
  
  const gap = 20;
  const width = 320;
  const viewportWidth = window.innerWidth;
  const canFitRight = rect.left + rect.width + gap + width < viewportWidth - 24;
  const canFitLeft = rect.left - width - gap > 24;
  
  if (canFitRight) {
    return { left: '-9px', top: '30px' };
  } else if (canFitLeft) {
    return { right: '-9px', top: '30px' };
  } else {
    return { top: '-9px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
  }
}
