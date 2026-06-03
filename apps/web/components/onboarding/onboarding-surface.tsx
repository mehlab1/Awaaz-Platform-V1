'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  ArrowRight,
  Bot,
  Building2,
  ChevronRight,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnboarding } from './onboarding-provider';

export const findVisibleOnboardingTarget = (targetId: string): Element | null => {
  const elements = document.querySelectorAll(`[data-onboarding-target="${targetId}"]`);
  for (const el of Array.from(elements)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return el;
    }
  }
  return null;
};

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

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
      <SoftHighlightOverlay rect={spotlight} />
      <MinimalProgressIndicator allComplete={allComplete} />
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
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="awaaz-onboarding-welcome-title"
        className="w-full max-w-2xl relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 shadow-[0_0_80px_-20px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-in zoom-in-95 slide-in-from-bottom-8 duration-700 ease-out"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        
        <div className="px-8 py-10 sm:px-12 sm:py-12">
          <div className="flex flex-col items-center text-center">
            <div className="grid size-16 place-items-center rounded-2xl border border-border/80 bg-background shadow-xl mb-6">
              <Sparkles className="size-8 text-primary" aria-hidden />
            </div>
            
            <h2
              id="awaaz-onboarding-welcome-title"
              className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4"
            >
              Build your first <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">working agent</span>
            </h2>
            
            <p className="max-w-lg text-base sm:text-lg text-muted-foreground leading-relaxed mb-10">
              We&apos;ll guide you through creating a workspace, adding your first voice agent, and running a live browser test call in minutes.
            </p>

            <div className="grid w-full gap-4 sm:grid-cols-3 mb-10">
              {[
                { number: '01', label: 'Create Workspace', icon: Building2 },
                { number: '02', label: 'Configure Agent', icon: Bot },
                { number: '03', label: 'Run Test Call', icon: PhoneCall },
              ].map((step) => (
                <div
                  key={step.label}
                  className="group flex flex-col items-center rounded-2xl border border-border/40 bg-background/40 p-5 transition-all duration-300 hover:bg-background/80 hover:scale-105 hover:shadow-lg"
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

            <div className="flex flex-col w-full sm:flex-row sm:items-center sm:justify-center gap-3">
              <Button
                id={WELCOME_START_BUTTON_ID}
                type="button"
                onClick={onStart}
                className="relative h-12 px-8 text-base font-semibold group overflow-hidden rounded-xl"
              >
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

function MinimalProgressIndicator({ allComplete }: { allComplete: boolean }) {
  const onboarding = useOnboarding();
  const completedSteps = onboarding.steps.filter((s) => s.completed).length;
  // Subtract the welcome step since it's an invisible initial state
  const totalRealSteps = onboarding.steps.length - 1; 
  const completedRealSteps = Math.max(0, completedSteps - 1);

  if (allComplete) {
    return (
      <div className="fixed bottom-6 right-6 z-[230] flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-4">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-medium text-primary">Setup complete!</span>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onboarding.dismiss}
          className="h-6 px-2 ml-2 text-primary hover:bg-primary/20 hover:text-primary"
        >
          Dismiss
        </Button>
      </div>
    );
  }

  const currentRealStep = onboarding.currentStep;

  return (
    <div className="fixed bottom-6 right-6 z-[230] flex items-center gap-3 rounded-full border border-border/60 bg-card/95 px-4 py-2.5 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center justify-center size-6 rounded-full bg-primary/10">
        <span className="text-xs font-bold text-primary">
          {completedRealSteps}/{totalRealSteps}
        </span>
      </div>
      <div className="flex flex-col mr-2">
        <span className="text-xs font-semibold text-foreground">
          {currentRealStep ? currentRealStep.title : 'Setup in progress'}
        </span>
      </div>
      {currentRealStep && (
        <Button
          size="sm"
          onClick={onboarding.runCurrentStepAction}
          className="h-7 text-[10px] px-3 rounded-full font-semibold"
        >
          Do this
          <ChevronRight className="ml-1 size-3" />
        </Button>
      )}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onboarding.dismiss}
        className="h-7 text-[10px] px-2.5 rounded-full text-muted-foreground hover:text-foreground"
      >
        Skip
      </Button>
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

function useSpotlightRect(targetId: string | null): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }

    const updateRect = () => {
      const el = findVisibleOnboardingTarget(targetId);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    };

    updateRect();
    const interval = setInterval(updateRect, 200);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [targetId]);

  return rect;
}

function SoftHighlightOverlay({ rect }: { rect: SpotlightRect | null }) {
  const [style, setStyle] = useState<React.CSSProperties>({
    opacity: 0,
    transform: 'scale(0.95)',
  });

  useEffect(() => {
    if (!rect) {
      setStyle({ opacity: 0, transform: 'scale(0.95)', transition: 'all 0.3s ease' });
      return;
    }

    setStyle({
      top: rect.top - 4,
      left: rect.left - 4,
      width: rect.width + 8,
      height: rect.height + 8,
      opacity: 1,
      transform: 'scale(1)',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    });
  }, [rect]);

  if (!rect && style.opacity === 0) return null;

  return (
    <div
      className="fixed z-[220] pointer-events-none rounded-lg ring-2 ring-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.2)]"
      style={style}
    >
      <div className="absolute inset-0 bg-primary/5 rounded-lg" />
    </div>
  );
}
