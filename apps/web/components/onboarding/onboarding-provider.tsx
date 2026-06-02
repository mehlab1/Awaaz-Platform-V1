'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import { useUser } from '@clerk/nextjs';
import { usePathname, useRouter } from 'next/navigation';
import useLocalStorageState from 'use-local-storage-state';

import { useOrgContext } from '@/components/org-context';

export type OnboardingStepId =
  | 'welcome'
  | 'organization'
  | 'agent'
  | 'testCall';

export type OnboardingStatus =
  | 'idle'
  | 'active'
  | 'dismissed'
  | 'completed';

interface OnboardingStepState {
  organizationCreated: boolean;
  agentCreated: boolean;
  testCallCompleted: boolean;
}

interface StoredOnboardingState {
  version: 2;
  status: OnboardingStatus;
  checklistCollapsed: boolean;
  startedAt?: string;
  dismissedAt?: string;
  completedAt?: string;
  steps: OnboardingStepState;
}

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  title: string;
  description: string;
  target?: string;
  completed: boolean;
}

interface OnboardingContextValue {
  status: OnboardingStatus;
  isEligible: boolean;
  isActive: boolean;
  checklistCollapsed: boolean;
  progress: number;
  steps: OnboardingStepDefinition[];
  currentStep: OnboardingStepDefinition | null;
  start: () => void;
  dismiss: () => void;
  setChecklistCollapsed: (collapsed: boolean) => void;
  markAgentCreated: () => void;
  markTestCallCompleted: () => void;
  runCurrentStepAction: () => void;
}

const DEFAULT_STATE: StoredOnboardingState = {
  version: 2,
  status: 'idle',
  checklistCollapsed: false,
  steps: {
    organizationCreated: false,
    agentCreated: false,
    testCallCompleted: false,
  },
};

const ONBOARDING_EVENT_AGENT_CREATED = 'awaaz:onboarding:agent-created';
const ONBOARDING_EVENT_TEST_COMPLETED =
  'awaaz:onboarding:test-interaction-completed';

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { orgs, loadingOrgs } = useOrgContext();
  const storageKey = user?.id
    ? `awaaz:onboarding:v2:${user.id}`
    : 'awaaz:onboarding:v2:anonymous';
  const [state, setState] = useLocalStorageState<StoredOnboardingState>(
    storageKey,
    { defaultValue: DEFAULT_STATE },
  );

  const normalizedState = normalizeState(state);
  const organizationCreated =
    normalizedState.steps.organizationCreated || orgs.length > 0;
  const steps = useMemo<OnboardingStepDefinition[]>(
    () => [
      {
        id: 'welcome',
        title: 'Start your Awaaz workspace',
        description:
          'Set up the essentials once, then move straight into building and testing your first voice agent.',
        completed: normalizedState.status !== 'idle',
      },
      {
        id: 'organization',
        title: 'Create your organization',
        description:
          'Your organization keeps agents, calls, numbers, billing, and teammates scoped cleanly.',
        target: 'create-organization',
        completed: organizationCreated,
      },
      {
        id: 'agent',
        title: 'Create your first agent',
        description:
          'Give the agent a name and a short description. You can tune instructions and voice after creation.',
        target: 'create-agent',
        completed: normalizedState.steps.agentCreated,
      },
      {
        id: 'testCall',
        title: 'Run a browser test call',
        description:
          'Open the agent preview and complete the first successful voice interaction.',
        target: 'test-agent',
        completed: normalizedState.steps.testCallCompleted,
      },
    ],
    [
      normalizedState.status,
      normalizedState.steps.agentCreated,
      normalizedState.steps.testCallCompleted,
      organizationCreated,
    ],
  );

  const completedStepCount = steps.filter((step) => step.completed).length;
  const progress = Math.round((completedStepCount / steps.length) * 100);
  const isEligible =
    userLoaded &&
    Boolean(user?.id) &&
    !loadingOrgs &&
    orgs.length === 0 &&
    normalizedState.status === 'idle';
  const isActive = normalizedState.status === 'active';
  const currentStep =
    normalizedState.status === 'active'
      ? steps.find((step) => !step.completed) ?? null
      : null;

  const patchState = useCallback(
    (updater: (current: StoredOnboardingState) => StoredOnboardingState) => {
      setState((current) => updater(normalizeState(current)));
    },
    [setState],
  );

  const start = useCallback(() => {
    patchState((current) => ({
      ...current,
      status: 'active',
      startedAt: current.startedAt ?? new Date().toISOString(),
      dismissedAt: undefined,
      completedAt: undefined,
      checklistCollapsed: false,
    }));
  }, [patchState]);

  const dismiss = useCallback(() => {
    patchState((current) => ({
      ...current,
      status: 'dismissed',
      dismissedAt: new Date().toISOString(),
      checklistCollapsed: false,
    }));
  }, [patchState]);

  const setChecklistCollapsed = useCallback(
    (collapsed: boolean) => {
      patchState((current) => ({
        ...current,
        checklistCollapsed: collapsed,
      }));
    },
    [patchState],
  );

  const markOrganizationCreated = useCallback(() => {
    patchState((current) => {
      if (current.steps.organizationCreated) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          organizationCreated: true,
        },
      };
    });
  }, [patchState]);

  const markAgentCreated = useCallback(() => {
    patchState((current) => {
      if (current.steps.agentCreated) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          agentCreated: true,
        },
      };
    });
  }, [patchState]);

  const markTestCallCompleted = useCallback(() => {
    patchState((current) => {
      if (current.steps.testCallCompleted) {
        return current;
      }
      return {
        ...current,
        steps: {
          ...current.steps,
          testCallCompleted: true,
        },
      };
    });
  }, [patchState]);

  const runCurrentStepAction = useCallback(() => {
    if (!currentStep) {
      return;
    }
    const target = currentStep.target
      ? findVisibleOnboardingTarget(currentStep.target)
      : null;
    if (target instanceof HTMLElement && !target.hasAttribute('disabled')) {
      target.focus({ preventScroll: false });
      target.click();
      return;
    }
    if (pathname !== '/agents' && currentStep.id !== 'testCall') {
      router.push('/agents');
    } else if (currentStep.id === 'testCall') {
      router.push('/agents');
    }
  }, [currentStep, pathname, router]);

  useEffect(() => {
    if (normalizedState.status !== 'active' || loadingOrgs || orgs.length === 0) {
      return;
    }
    markOrganizationCreated();
  }, [
    loadingOrgs,
    markOrganizationCreated,
    normalizedState.status,
    orgs.length,
  ]);

  useEffect(() => {
    const onAgentCreated = () => markAgentCreated();
    const onTestCompleted = () => markTestCallCompleted();
    window.addEventListener(ONBOARDING_EVENT_AGENT_CREATED, onAgentCreated);
    window.addEventListener(
      ONBOARDING_EVENT_TEST_COMPLETED,
      onTestCompleted,
    );
    return () => {
      window.removeEventListener(ONBOARDING_EVENT_AGENT_CREATED, onAgentCreated);
      window.removeEventListener(
        ONBOARDING_EVENT_TEST_COMPLETED,
        onTestCompleted,
      );
    };
  }, [markAgentCreated, markTestCallCompleted]);

  useEffect(() => {
    if (normalizedState.status !== 'active') {
      return undefined;
    }
    const allComplete =
      organizationCreated &&
      normalizedState.steps.agentCreated &&
      normalizedState.steps.testCallCompleted;
    if (!allComplete) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      patchState((current) => ({
        ...current,
        status: 'completed',
        completedAt: current.completedAt ?? new Date().toISOString(),
        checklistCollapsed: false,
      }));
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [
    normalizedState.status,
    normalizedState.steps.agentCreated,
    normalizedState.steps.testCallCompleted,
    organizationCreated,
    patchState,
  ]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      status: normalizedState.status,
      isEligible,
      isActive,
      checklistCollapsed: normalizedState.checklistCollapsed,
      progress,
      steps,
      currentStep,
      start,
      dismiss,
      setChecklistCollapsed,
      markAgentCreated,
      markTestCallCompleted,
      runCurrentStepAction,
    }),
    [
      currentStep,
      dismiss,
      isActive,
      isEligible,
      markAgentCreated,
      markTestCallCompleted,
      normalizedState.checklistCollapsed,
      normalizedState.status,
      progress,
      runCurrentStepAction,
      setChecklistCollapsed,
      start,
      steps,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}

export function dispatchOnboardingAgentCreated() {
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT_AGENT_CREATED));
}

export function dispatchOnboardingTestInteractionCompleted() {
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT_TEST_COMPLETED));
}

function normalizeState(
  value: StoredOnboardingState | undefined,
): StoredOnboardingState {
  if (!value || value.version !== 2) {
    return DEFAULT_STATE;
  }
  return {
    version: 2,
    status: value.status ?? 'idle',
    checklistCollapsed: Boolean(value.checklistCollapsed),
    startedAt: value.startedAt,
    dismissedAt: value.dismissedAt,
    completedAt: value.completedAt,
    steps: {
      organizationCreated: Boolean(value.steps?.organizationCreated),
      agentCreated: Boolean(value.steps?.agentCreated),
      testCallCompleted: Boolean(value.steps?.testCallCompleted),
    },
  };
}

function findVisibleOnboardingTarget(target: string): Element | null {
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
