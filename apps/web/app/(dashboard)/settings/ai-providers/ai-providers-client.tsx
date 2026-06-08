'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';

import { useOrgContext } from '@/components/org-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type CatalogProvider,
  type CredentialMode,
  useProviderCredentials,
} from '@/hooks/use-provider-credentials';
import { cn } from '@/lib/utils';

type ProviderKind = 'llm' | 'stt' | 'tts';

interface VoiceOption {
  rimeVoiceId: string;
  name: string;
  provider?: string | null;
}

type ProviderDraft = {
  apiKey: string;
  credentialMode: CredentialMode;
  metadata: Record<string, string>;
};

const KIND_LABELS: Record<ProviderKind, string> = {
  llm: 'LLM',
  stt: 'STT',
  tts: 'TTS',
};

const KIND_DESCRIPTIONS: Record<ProviderKind, string> = {
  llm: 'Text generation models used by live voice agents.',
  stt: 'Speech recognition providers and streaming transcription models.',
  tts: 'Voice synthesis providers and voice/model defaults.',
};

const DEFAULT_DRAFT: ProviderDraft = {
  apiKey: '',
  credentialMode: 'BYOK',
  metadata: {},
};

export type BadgeStatus = 'not_configured' | 'configured_valid' | 'configured_invalid' | 'finova_managed' | 'finova_unavailable';

export function AiProvidersClient() {
  const {
    activeOrgId,
    canManage,
    catalog,
    upsertCredential,
    validateCredential,
    deleteCredential,
  } = useProviderCredentials();
  const { apiCall } = useOrgContext();
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrgId) {
      setVoices([]);
      return undefined;
    }
    apiCall('/api/v1/voices', { method: 'GET' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text() || response.statusText);
        }
        return response.json() as Promise<VoiceOption[]>;
      })
      .then((rows) => {
        if (!cancelled) {
          setVoices(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVoices([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, apiCall]);

  useEffect(() => {
    const providers = catalog.data ?? [];
    setDrafts((current) => {
      const next = { ...current };
      for (const provider of providers) {
        if (next[provider.id]) {
          continue;
        }
        next[provider.id] = {
          apiKey: '',
          credentialMode:
            provider.organizationCredential?.credentialMode ?? 'BYOK',
          metadata: metadataToDraft(provider.organizationCredential?.metadata),
        };
      }
      return next;
    });
  }, [catalog.data]);

  const providersByKind = useMemo(() => {
    const groups: Record<ProviderKind, CatalogProvider[]> = {
      llm: [],
      stt: [],
      tts: [],
    };
    for (const provider of catalog.data ?? []) {
      groups[provider.kind].push(provider);
    }
    return groups;
  }, [catalog.data]);

  const saveProvider = async (provider: CatalogProvider) => {
    const draft = draftFor(drafts, provider.id);
    await upsertCredential.mutateAsync({
      providerId: provider.id,
      input: {
        credentialMode: draft.credentialMode,
        ...(draft.credentialMode === 'BYOK' && draft.apiKey.trim()
          ? { apiKey: draft.apiKey.trim() }
          : {}),
        metadata: cleanMetadata(draft.metadata),
      },
    });
    setDrafts((current) => ({
      ...current,
      [provider.id]: { ...draft, apiKey: '' },
    }));
  };

  const validateProvider = async (provider: CatalogProvider) => {
    await validateCredential.mutateAsync(provider.id);
  };

  const removeProvider = async (provider: CatalogProvider) => {
    await deleteCredential.mutateAsync(provider.id);
    setDrafts((current) => ({
      ...current,
      [provider.id]: DEFAULT_DRAFT,
    }));
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border/50 pb-5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            AI Providers
          </h1>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Manage workspace provider keys and default provider settings for voice
          agents.
        </p>
      </div>


      {catalog.isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-lg border border-border/50 bg-muted/20"
            />
          ))}
        </div>
      ) : catalog.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {catalog.error.message}
        </p>
      ) : (
        (Object.keys(providersByKind) as ProviderKind[]).map((kind) => (
          <section key={kind} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {KIND_LABELS[kind]}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {KIND_DESCRIPTIONS[kind]}
              </p>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {providersByKind[kind].map((provider) => (
                <ProviderCredentialCard
                  key={provider.id}
                  provider={provider}
                  draft={draftFor(drafts, provider.id)}
                  voices={voices}
                  canManage={canManage}
                  onDraftChange={(draft) =>
                    setDrafts((current) => ({
                      ...current,
                      [provider.id]: draft,
                    }))
                  }
                  onSave={() => saveProvider(provider)}
                  onValidate={() => validateProvider(provider)}
                  onDelete={() => removeProvider(provider)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ProviderCredentialCard({
  provider,
  draft,
  voices,
  canManage,
  onDraftChange,
  onSave,
  onValidate,
  onDelete,
}: {
  provider: CatalogProvider;
  draft: ProviderDraft;
  voices: VoiceOption[];
  canManage: boolean;
  onDraftChange: (draft: ProviderDraft) => void;
  onSave: () => Promise<void>;
  onValidate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await onSave();
      
      if (draft.credentialMode === 'BYOK') {
        try {
          await onValidate();
          setMessage(`${provider.label} settings saved and validated successfully.`);
        } catch (validationErr) {
          setMessage(`${provider.label} settings saved, but validation failed.`);
          setError(validationErr instanceof Error ? validationErr.message : String(validationErr));
        }
      } else {
        setMessage(`${provider.label} settings saved.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await onValidate();
      setMessage(`${provider.label} validation completed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete the credential for ${provider.label}? Any agents relying on this will break.`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await onDelete();
      setMessage(`${provider.label} credential deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const credential = provider.organizationCredential;
  const byokStatus = provider.orgCredentialStatus ?? 'not_configured';
  const isFinovaManaged = 
    credential?.credentialMode === 'FINOVA_MANAGED' || 
    (!credential && provider.availableVia === 'FINOVA_MANAGED');

  const displayStatus: BadgeStatus = 
    isFinovaManaged
      ? (provider.finovaManagedAvailable ? 'finova_managed' : 'finova_unavailable')
      : (byokStatus as BadgeStatus);
  const providerVoices = voices.filter(
    (voice) => voice.provider === provider.id,
  );
  const hasCredential = Boolean(credential?.hasSecret);
  const canSave =
    canManage &&
    !busy &&
    (draft.credentialMode === 'FINOVA_MANAGED' ||
      draft.apiKey.trim().length > 0 ||
      hasCredential);

  return (
    <article className="rounded-lg border border-border/60 bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {provider.label}
            </h3>
            <ProviderStatusBadge status={displayStatus} />
            {provider.runtimeSupported === false ? (
              <Badge variant="secondary">Runtime unavailable</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {provider.id} · {provider.kind.toUpperCase()}
          </p>
        </div>
        {credential?.keyPrefix ? (
          <span className="rounded-md border border-border/60 bg-muted/20 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {credential.keyPrefix}...
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Credential Mode
          </span>
          <select
            value={draft.credentialMode}
            disabled={!canManage}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                credentialMode: event.target.value as CredentialMode,
              })
            }
            className="h-9 rounded-md border border-border/70 bg-background px-2.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="BYOK">Saved Workspace Key</option>
            <option value="FINOVA_MANAGED" disabled={!provider.finovaManagedAvailable}>
              Finova Managed {!provider.finovaManagedAvailable ? '(Unavailable)' : ''}
            </option>
          </select>
        </label>

        {draft.credentialMode === 'BYOK' ? (
          <label className="grid gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              API Key
            </span>
            <input
              type="password"
              value={draft.apiKey}
              disabled={!canManage}
              placeholder={`Paste ${provider.label} API key`}
              onChange={(event) =>
                onDraftChange({ ...draft, apiKey: event.target.value })
              }
              className="h-9 rounded-md border border-border/70 bg-background px-2.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        ) : null}

        <ProviderMetadataFields
          provider={provider}
          draft={draft}
          voices={providerVoices}
          disabled={!canManage}
          onDraftChange={onDraftChange}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={!canSave}
            onClick={handleSave}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!canManage || busy || !hasCredential}
            onClick={handleValidate}
          >
            <RefreshCw className="size-3.5" />
            Validate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!canManage || busy || !credential}
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          {!canManage ? (
            <span className="text-xs text-muted-foreground">
              Admin access required to change credentials.
            </span>
          ) : null}
        </div>

        {message ? (
          <p className="text-xs leading-relaxed text-emerald-600 dark:text-emerald-400 mt-2">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs leading-relaxed text-destructive mt-2">
            {error}
          </p>
        ) : null}
        {credential?.validationError && !error ? (
          <p className="text-xs leading-relaxed text-destructive mt-2">
            {credential.validationError}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ProviderMetadataFields({
  provider,
  draft,
  voices,
  disabled,
  onDraftChange,
}: {
  provider: CatalogProvider;
  draft: ProviderDraft;
  voices: VoiceOption[];
  disabled: boolean;
  onDraftChange: (draft: ProviderDraft) => void;
}) {
  const updateMetadata = (key: string, value: string) =>
    onDraftChange({
      ...draft,
      metadata: { ...draft.metadata, [key]: value },
    });

  if (provider.kind === 'llm') {
    return (
      <MetadataSelect
        label="Default Model"
        value={draft.metadata.model ?? provider.defaultModel ?? ''}
        disabled={disabled}
        options={(provider.models ?? []).map((model) => ({
          value: model.id,
          label: model.label,
        }))}
        onChange={(value) => updateMetadata('model', value)}
      />
    );
  }

  if (provider.kind === 'stt') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <MetadataSelect
          label="Default Model"
          value={draft.metadata.model ?? provider.defaultModel ?? ''}
          disabled={disabled}
          options={(provider.models ?? []).map((model) => ({
            value: model.id,
            label: model.label,
          }))}
          onChange={(value) => updateMetadata('model', value)}
        />
        <MetadataInput
          label="Language"
          value={draft.metadata.language ?? ''}
          disabled={disabled}
          placeholder="en"
          onChange={(value) => updateMetadata('language', value)}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MetadataSelect
        label="Default Voice"
        value={draft.metadata.voiceId ?? ''}
        disabled={disabled || voices.length === 0}
        options={voices.map((voice) => ({
          value: voice.rimeVoiceId,
          label: voice.name,
        }))}
        onChange={(value) => updateMetadata('voiceId', value)}
      />
      <MetadataInput
        label="Default Model"
        value={draft.metadata.model ?? provider.defaultModel ?? ''}
        disabled={disabled}
        placeholder={provider.defaultModel ?? 'provider default'}
        onChange={(value) => updateMetadata('model', value)}
      />
    </div>
  );
}

function MetadataSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-border/70 bg-background px-2.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Provider default</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetadataInput({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-border/70 bg-background px-2.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function ProviderStatusBadge({
  status,
}: {
  status: BadgeStatus;
}) {
  const config = {
    not_configured: {
      label: 'Not configured',
      icon: XCircle,
      className: 'border-border bg-muted/20 text-muted-foreground',
    },
    configured_valid: {
      label: 'BYOK Valid',
      icon: CheckCircle2,
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
    },
    configured_invalid: {
      label: 'BYOK Invalid',
      icon: XCircle,
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
    finova_managed: {
      label: 'Finova Managed',
      icon: CheckCircle2,
      className: 'border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100',
    },
    finova_unavailable: {
      label: 'Unavailable',
      icon: XCircle,
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        config.className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {config.label}
    </span>
  );
}

function draftFor(
  drafts: Record<string, ProviderDraft>,
  providerId: string,
): ProviderDraft {
  return drafts[providerId] ?? DEFAULT_DRAFT;
}

function metadataToDraft(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value as string]),
  );
}

function cleanMetadata(metadata: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value.trim().length > 0),
  );
}



