'use client';

import { useEffect, useRef, useState } from 'react';

import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type CatalogProvider,
  type CredentialMode,
  type PluginCredential,
  useProviderCredentials,
} from '@/hooks/use-provider-credentials';
import { cn } from '@/lib/utils';

export function AiProvidersClient() {
  const api = useProviderCredentials();
  const { catalog, credentials, canManage, activeOrgId } = api;

  if (!activeOrgId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization first.
      </p>
    );
  }

  const providers = catalog.data ?? [];
  const creds = credentials.data ?? [];

  const ttsProviders = providers.filter((p) => p.kind === 'tts');
  const llmProviders = providers.filter((p) => p.kind === 'llm');
  const sttProviders = providers.filter((p) => p.kind === 'stt');

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="size-6 text-foreground" />
            AI Providers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage credentials and integrations for voice, language, and speech recognition models.
          </p>
        </div>
      </header>

      {/* Error state if any */}
      {catalog.error || credentials.error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Failed to load providers</p>
            <p className="text-xs text-destructive/80">
              {catalog.error?.message || credentials.error?.message}
            </p>
          </div>
        </div>
      ) : null}

      {!canManage ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Provider management requires an OWNER or ADMIN role. You can still view
          provider availability for this organization.
        </div>
      ) : null}

      <Tabs defaultValue="tts" className="w-full">
        <TabsList className="mb-6 h-10 w-full sm:w-auto p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="tts" className="flex-1 sm:flex-none px-6 rounded-lg text-sm transition-all data-active:shadow-sm">
            Text-to-Speech (TTS)
          </TabsTrigger>
          <TabsTrigger value="llm" className="flex-1 sm:flex-none px-6 rounded-lg text-sm transition-all data-active:shadow-sm">
            Language Models (LLM)
          </TabsTrigger>
          <TabsTrigger value="stt" className="flex-1 sm:flex-none px-6 rounded-lg text-sm transition-all data-active:shadow-sm">
            Speech-to-Text (STT)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tts" className="mt-0">
          <ProviderList 
            providers={ttsProviders} 
            credentials={creds} 
            isLoading={catalog.isLoading}
            api={api}
          />
        </TabsContent>
        <TabsContent value="llm" className="mt-0">
          <ProviderList 
            providers={llmProviders} 
            credentials={creds} 
            isLoading={catalog.isLoading}
            api={api}
          />
        </TabsContent>
        <TabsContent value="stt" className="mt-0">
          <ProviderList 
            providers={sttProviders} 
            credentials={creds} 
            isLoading={catalog.isLoading}
            api={api}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProviderList({ 
  providers, 
  credentials, 
  isLoading,
  api 
}: { 
  providers: CatalogProvider[]; 
  credentials: PluginCredential[];
  isLoading: boolean;
  api: ReturnType<typeof useProviderCredentials>;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading providers...</p>;
  }

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-10 text-center">
        <Sparkles className="mx-auto size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-foreground">No providers available</p>
        <p className="mt-1 text-xs text-muted-foreground">Check back later or contact support.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {providers.map(provider => (
        <ProviderCard 
          key={provider.id} 
          provider={provider} 
          credential={
            credentials.find(c => c.providerId === provider.id) ??
            provider.organizationCredential ??
            undefined
          }
          api={api}
        />
      ))}
    </div>
  );
}

function ProviderCard({ 
  provider, 
  credential,
  api
}: { 
  provider: CatalogProvider; 
  credential?: PluginCredential;
  api: ReturnType<typeof useProviderCredentials>;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const status = credential?.status || 'NOT_CONFIGURED';
  const mode = credential?.credentialMode;

  const getStatusBadge = () => {
    switch (status) {
      case 'VALID':
        return <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-500/10 shrink-0">Valid</Badge>;
      case 'INVALID':
        return <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 shrink-0">Invalid</Badge>;
      case 'CONFIGURED':
        return <Badge variant="outline" className="border-blue-500/30 text-blue-700 bg-blue-500/10 shrink-0">Configured</Badge>;
      case 'NOT_CONFIGURED':
      default:
        return <Badge variant="secondary" className="text-muted-foreground shrink-0">Not Configured</Badge>;
    }
  };

  const isByok = mode === 'BYOK';
  const isManaged = mode === 'FINOVA_MANAGED';
  const canManage = api.canManage;

  const onUseManaged = async () => {
    try {
      await api.upsertCredential.mutateAsync({
        providerId: provider.id,
        input: { credentialMode: 'FINOVA_MANAGED' }
      });
    } catch {
      // Error is handled globally or we could toast here
    }
  };

  const onValidate = async () => {
    try {
      await api.validateCredential.mutateAsync(provider.id);
    } catch {}
  };

  const onReset = async () => {
    try {
      await api.deleteCredential.mutateAsync(provider.id);
      setResetConfirmOpen(false);
    } catch {}
  };

  return (
    <>
      <Card className="flex flex-col h-full hover:border-border/80 transition-colors">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {provider.label}
              </CardTitle>
              <CardDescription className="text-xs mt-1.5 flex items-center gap-1.5">
                {provider.available ? (
                  <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                    <span className="relative mr-1.5 flex size-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Available
                  </span>
                ) : (
                  <span className="flex items-center text-muted-foreground">
                    <span className="mr-1.5 size-1.5 rounded-full bg-muted-foreground/40" />
                    Unavailable
                  </span>
                )}
                {provider.availableVia && (
                  <span className="text-muted-foreground/60">· via {provider.availableVia}</span>
                )}
              </CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        
        <CardContent className="pt-4 flex flex-col flex-1 gap-4 justify-between">
          <div className="space-y-4">
            {/* Mode & Key Details */}
            {status !== 'NOT_CONFIGURED' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    {isManaged ? (
                      <><Building2 className="size-3.5 text-blue-500" /> Finova Managed</>
                    ) : (
                      <><KeyRound className="size-3.5 text-amber-500" /> Bring Your Own Key</>
                    )}
                  </span>
                </div>
                
                {isByok && credential?.keyPrefix && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Key Prefix</span>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                      {credential.keyPrefix}••••••
                    </code>
                  </div>
                )}
                
                {credential?.lastValidatedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Validated</span>
                    <span className="text-foreground/80 text-xs">
                      {safeRelativeTime(credential.lastValidatedAt)}
                    </span>
                  </div>
                )}

                {credential?.validationError && (
                  <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive flex gap-2 items-start mt-2">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span className="leading-snug break-words">{credential.validationError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="size-10 rounded-full bg-muted/30 flex items-center justify-center mb-2">
                  <Settings2 className="size-5 text-muted-foreground/60" />
                </div>
                <p className="text-sm text-foreground/80 font-medium">Not configured</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px]">
                  Configure this provider to use it in your agents.
                </p>
              </div>
            )}
          </div>
          
          {/* Actions Footer */}
          <div className="pt-3 border-t border-border/40 grid grid-cols-2 gap-2 mt-auto">
            {status !== 'NOT_CONFIGURED' ? (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-xs"
                  onClick={() => setConfigOpen(true)}
                  disabled={!canManage || api.upsertCredential.isPending}
                >
                  Configure
                </Button>
                <div className="flex gap-1.5">
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    className="flex-1 shrink-0 px-0 h-8"
                    onClick={onValidate}
                    disabled={!canManage || api.validateCredential.isPending}
                    title="Validate credentials"
                  >
                    {api.validateCredential.isPending && api.validateCredential.variables === provider.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-3.5 text-emerald-600" />
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    className="flex-1 shrink-0 px-0 h-8 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                    onClick={() => setResetConfirmOpen(true)}
                    disabled={!canManage || api.deleteCredential.isPending}
                    title="Reset configuration"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                {provider.supportsFinovaManaged && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="w-full text-xs"
                    onClick={onUseManaged}
                    disabled={!canManage || api.upsertCredential.isPending || !provider.finovaManagedAvailable}
                  >
                    Use Managed
                  </Button>
                )}
                <Button 
                  variant={provider.supportsFinovaManaged ? "outline" : "secondary"} 
                  size="sm" 
                  className={cn("w-full text-xs", !provider.supportsFinovaManaged && "col-span-2")}
                  onClick={() => setConfigOpen(true)}
                  disabled={!canManage || api.upsertCredential.isPending || !provider.supportsByok}
                >
                  Configure BYOK
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfigureCredentialDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        provider={provider}
        api={api}
        initialMode={isManaged ? 'FINOVA_MANAGED' : 'BYOK'}
        hasExistingByok={Boolean(isByok && credential?.hasSecret)}
      />

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset the configuration for {provider.label}? 
              This will remove your API key and agents using this provider may fail if no fallback is configured.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)} disabled={api.deleteCredential.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onReset} disabled={api.deleteCredential.isPending}>
              {api.deleteCredential.isPending ? 'Resetting...' : 'Yes, reset it'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfigureCredentialDialog({
  open,
  onOpenChange,
  provider,
  api,
  initialMode,
  hasExistingByok,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: CatalogProvider;
  api: ReturnType<typeof useProviderCredentials>;
  initialMode: CredentialMode;
  hasExistingByok: boolean;
}) {
  const [mode, setMode] = useState<CredentialMode>(initialMode);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setMode(initialMode);
      setApiKey('');
      setShowKey(false);
      api.upsertCredential.reset();
    }
    wasOpenRef.current = open;
  }, [api.upsertCredential, initialMode, open]);

  const isManaged = mode === 'FINOVA_MANAGED';
  const isPending = api.upsertCredential.isPending;
  const byokRequiresKey = mode === 'BYOK' && !hasExistingByok;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.upsertCredential.mutateAsync({
        providerId: provider.id,
        input: {
          credentialMode: mode,
          ...(mode === 'BYOK' && apiKey.trim() ? { apiKey: apiKey.trim() } : {})
        }
      });
      setApiKey('');
      onOpenChange(false);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) setApiKey('');
      onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSave}>
          <DialogHeader>
            <DialogTitle>Configure {provider.label}</DialogTitle>
            <DialogDescription>
              Set up credentials to use this provider in your agents.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {api.upsertCredential.error && (
              <div className="p-3 rounded-md bg-destructive/10 text-sm text-destructive border border-destructive/20">
                {api.upsertCredential.error.message}
              </div>
            )}

            {provider.supportsFinovaManaged && provider.supportsByok && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors text-center",
                    mode === 'BYOK' ? "border-foreground bg-foreground/5 shadow-sm" : "border-border hover:bg-muted/50"
                  )}>
                    <input 
                      type="radio" 
                      name="mode" 
                      className="sr-only" 
                      checked={mode === 'BYOK'} 
                      onChange={() => setMode('BYOK')} 
                    />
                    <KeyRound className={cn("size-5 mb-1.5", mode === 'BYOK' ? "text-foreground" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-semibold", mode === 'BYOK' ? "text-foreground" : "text-muted-foreground")}>Bring Your Own Key</span>
                  </label>
                  <label className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors text-center",
                    mode === 'FINOVA_MANAGED' ? "border-foreground bg-foreground/5 shadow-sm" : "border-border hover:bg-muted/50",
                    !provider.finovaManagedAvailable && "opacity-50 cursor-not-allowed hover:bg-transparent"
                  )}>
                    <input 
                      type="radio" 
                      name="mode" 
                      className="sr-only" 
                      checked={mode === 'FINOVA_MANAGED'} 
                      disabled={!provider.finovaManagedAvailable}
                      onChange={() => setMode('FINOVA_MANAGED')} 
                    />
                    <Building2 className={cn("size-5 mb-1.5", mode === 'FINOVA_MANAGED' ? "text-foreground" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-semibold", mode === 'FINOVA_MANAGED' ? "text-foreground" : "text-muted-foreground")}>Finova Managed</span>
                  </label>
                </div>
              </div>
            )}

            {!isManaged && (
              <div className="space-y-2">
                <label htmlFor="apiKey" className="text-sm font-medium text-foreground">
                  API Key
                </label>
                <div className="relative">
                  <input
                    id="apiKey"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key..."
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-foreground/50 transition-all"
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowKey(!showKey)}
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave empty to keep your existing key. Your full key is never displayed.
                </p>
              </div>
            )}
            
            {isManaged && (
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex gap-3 text-sm text-blue-700 dark:text-blue-300">
                <ShieldCheck className="size-5 shrink-0" />
                <p>
                  Finova Managed mode uses our enterprise credentials. Billing is handled through your Awaaz account. No API key required.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || (byokRequiresKey && !apiKey.trim())}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function safeRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDistanceToNow(d, { addSuffix: true });
}
