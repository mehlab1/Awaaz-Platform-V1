'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileAudio,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const DEFAULT_API_BASE = 'https://qualicall-api.onrender.com';
const API_BASE = (
  process.env.NEXT_PUBLIC_QUALICALL_API_URL ?? DEFAULT_API_BASE
).replace(/\/+$/, '');
const POLL_INTERVAL_MS = 4_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const UPLOAD_TIMEOUT_MS = 180_000;

const PIPELINE_STEPS = [
  'uploaded',
  'preprocessing',
  'transcribing',
  'analyzing',
  'scoring',
  'coaching',
  'complete',
] as const;

const TERMINAL_STATUSES = new Set(['complete', 'failed']);
const RESULT_TABS = ['Transcript', 'Scorecard', 'Analysis', 'Coaching'] as const;

type ResultTab = (typeof RESULT_TABS)[number];

interface HealthPayload {
  status?: string;
  db?: string;
  db_result?: number;
}

interface ScriptSection {
  section_number?: number;
  title?: string;
  type?: string;
  required_info?: string;
  verbatim_required?: boolean;
  conditional?: boolean;
  condition_text?: string | null;
}

interface ScriptListItem {
  id: string;
  name: string;
  created_at?: string;
}

interface ScriptUploadResult {
  script_id: string;
  name: string;
  sections_parsed?: number;
  sections?: unknown;
}

interface CallUploadResult {
  call_id: string;
  status: string;
  message?: string;
}

interface CallStatusPayload {
  status: string;
  error_message?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

interface TranscriptTurn {
  turn_index?: number;
  speaker_role?: 'agent' | 'customer' | string;
  speaker_label?: string;
  text?: string;
  start_ms?: number | null;
  end_ms?: number | null;
  sentiment?: string | null;
  sentiment_confidence?: number | null;
}

interface RecentCall {
  id: string;
  agent_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  overall_score?: number | null;
}

interface ScorecardPayload {
  overall_score?: number | null;
  script_adherence_score?: number | null;
  communication_sentiment_score?: number | null;
  objection_refusal_score?: number | null;
  call_outcome_score?: number | null;
  professionalism_score?: number | null;
  compliance_gate_passed?: boolean | null;
  weights_used?: Record<string, number> | null;
}

interface MetricsPayload {
  duration_seconds?: number | null;
  agent_talk_ratio?: number | null;
  customer_talk_ratio?: number | null;
  agent_interruptions?: number | null;
  customer_interruptions?: number | null;
  filler_word_count?: number | null;
  filler_words_per_minute?: number | null;
  talk_to_listen_ratio_flag?: string | null;
}

interface SectionBreakdown {
  section_number?: number;
  title?: string;
  coverage_score?: number | null;
  phrasing_score?: number | null;
  position_score?: number | null;
  status?: string | null;
  deviation_type?: string | null;
  evidence?: string | null;
  notes?: string | null;
}

interface ReportAnalysis {
  script_adherence_score?: number | null;
  script_section_breakdown?: unknown;
  script_deviations?: unknown;
  compliance_violations?: unknown;
  sentiment_summary?: string | null;
  customer_emotional_outcome?: string | null;
  escalation_risk?: boolean | null;
  escalation_risk_reason?: string | null;
  compliance_passed?: boolean | null;
  agent_empathy_score?: number | null;
  customer_engagement_score?: number | null;
  resolution_confidence_score?: number | null;
  sentiment_arc?: unknown;
}

interface MissedRebuttal {
  customer_said?: string;
  agent_did?: string;
  should_have_said?: string;
}

interface CoachingPayload {
  what_went_well?: string | null;
  where_lost_points?: string | null;
  missed_rebuttals?: unknown;
  sentiment_pattern_summary?: string | null;
  priority_focus?: string | null;
  full_report_md?: string | null;
}

interface ReportPayload {
  call?: Record<string, unknown> | null;
  metrics?: MetricsPayload | null;
  analysis?: ReportAnalysis | null;
  scorecard?: ScorecardPayload | null;
  coaching?: CoachingPayload | null;
}

interface LoadResults {
  status?: CallStatusPayload;
  transcript?: TranscriptTurn[];
  report?: ReportPayload | null;
}

export default function QualicallPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [scripts, setScripts] = useState<ScriptListItem[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(true);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState('');
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [scriptUploading, setScriptUploading] = useState(false);
  const [uploadedScript, setUploadedScript] = useState<ScriptUploadResult | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [agentName, setAgentName] = useState('');
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [callPurpose, setCallPurpose] = useState('');
  const [agentSpeakerLabel, setAgentSpeakerLabel] = useState('A');
  const [compliancePhrases, setCompliancePhrases] = useState('');
  const [expectedDuration, setExpectedDuration] = useState('');
  const [callUploading, setCallUploading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<CallStatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('Transcript');

  const [history, setHistory] = useState<RecentCall[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const healthTone =
    health?.status === 'ok' && health?.db === 'connected'
      ? 'success'
      : healthError
        ? 'danger'
        : 'neutral';

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await apiJson<HealthPayload>('/health', { timeoutMs: 75_000 });
      setHealth(data);
    } catch (error) {
      setHealth(null);
      setHealthError(errorMessage(error));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadScripts = useCallback(async () => {
    setScriptsLoading(true);
    setScriptsError(null);
    try {
      const data = await apiJson<ScriptListItem[]>('/api/scripts/');
      const safeScripts = Array.isArray(data) ? data : [];
      setScripts(safeScripts);
      setSelectedScriptId((current) => current || safeScripts[0]?.id || '');
    } catch (error) {
      setScripts([]);
      setScriptsError(errorMessage(error));
    } finally {
      setScriptsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await apiJson<RecentCall[]>('/api/calls/');
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      setHistory([]);
      setHistoryError(errorMessage(error));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadResults = useCallback(async (callId: string): Promise<LoadResults> => {
    setResultsLoading(true);
    setResultsError(null);
    try {
      const [transcriptData, reportData] = await Promise.all([
        apiJson<TranscriptTurn[]>(`/api/calls/${callId}/transcript`),
        apiJson<ReportPayload>(`/api/calls/${callId}/report`),
      ]);
      const safeTranscript = Array.isArray(transcriptData) ? transcriptData : [];
      setTranscript(safeTranscript);
      setReport(reportData ?? null);
      return { transcript: safeTranscript, report: reportData ?? null };
    } catch (error) {
      const message = errorMessage(error);
      setResultsError(message);
      return {};
    } finally {
      setResultsLoading(false);
    }
  }, []);

  const loadStatus = useCallback(
    async (callId: string): Promise<CallStatusPayload | null> => {
      setStatusLoading(true);
      setStatusError(null);
      try {
        const data = await apiJson<CallStatusPayload>(`/api/calls/${callId}/status`);
        setStatus(data);
        if (data.status === 'complete') {
          await loadResults(callId);
          void loadHistory();
        }
        return data;
      } catch (error) {
        setStatusError(errorMessage(error));
        return null;
      } finally {
        setStatusLoading(false);
      }
    },
    [loadHistory, loadResults],
  );

  useEffect(() => {
    void loadHealth();
    void loadScripts();
    void loadHistory();
  }, [loadHealth, loadScripts, loadHistory]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callId = params.get('call_id');
    if (!callId) {
      return;
    }
    setActiveCallId(callId);
    void loadStatus(callId);
  }, [loadStatus]);

  useEffect(() => {
    if (!activeCallId || TERMINAL_STATUSES.has(status?.status ?? '')) {
      return undefined;
    }
    let timeoutId: number | undefined;
    let cancelled = false;

    const poll = async () => {
      const nextStatus = await loadStatus(activeCallId);
      if (!cancelled && !TERMINAL_STATUSES.has(nextStatus?.status ?? '')) {
        timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeCallId, loadStatus, status?.status]);

  const handleScriptUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scriptFile || !scriptName.trim()) {
      setScriptsError('Choose a script file and enter a script name.');
      return;
    }
    setScriptUploading(true);
    setScriptsError(null);
    try {
      const body = new FormData();
      body.append('file', scriptFile);
      body.append('name', scriptName.trim());
      const result = await apiJson<ScriptUploadResult>('/api/scripts/', {
        method: 'POST',
        body,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      setUploadedScript(result);
      setSelectedScriptId(result.script_id);
      setScriptName('');
      setScriptFile(null);
      await loadScripts();
    } catch (error) {
      setScriptsError(errorMessage(error));
    } finally {
      setScriptUploading(false);
    }
  };

  const handleCallUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCallError(null);
    if (!audioFile || !agentName.trim() || !selectedScriptId) {
      setCallError('Choose an audio file, agent name, and script.');
      return;
    }

    setCallUploading(true);
    setTranscript([]);
    setReport(null);
    setStatus(null);
    setResultsError(null);
    setStatusError(null);

    try {
      const body = new FormData();
      body.append('audio', audioFile);
      body.append('agent_name', agentName.trim());
      body.append('script_id', selectedScriptId);
      body.append('call_purpose', callPurpose.trim());
      body.append('agent_speaker_label', agentSpeakerLabel);
      body.append('compliance_phrases', compliancePhrases);
      const duration = Number.parseInt(expectedDuration, 10);
      if (Number.isFinite(duration) && duration > 0) {
        body.append('expected_duration_seconds', String(duration));
      }

      const result = await apiJson<CallUploadResult>('/api/calls/upload', {
        method: 'POST',
        body,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
      const nextStatus = {
        status: result.status,
        error_message: null,
        created_at: null,
        completed_at: null,
      };
      setActiveCallId(result.call_id);
      setStatus(nextStatus);
      setAudioFile(null);
      await loadStatus(result.call_id);
      void loadHistory();
    } catch (error) {
      setCallError(errorMessage(error));
    } finally {
      setCallUploading(false);
    }
  };

  const selectHistoryCall = async (callId: string) => {
    setActiveCallId(callId);
    setTranscript([]);
    setReport(null);
    setStatus(null);
    setResultsError(null);
    setStatusError(null);
    setResultTab('Transcript');
    window.history.replaceState(null, '', `?call_id=${encodeURIComponent(callId)}`);
    await loadStatus(callId);
  };

  const scorecard = report?.scorecard ?? null;
  const analysis = report?.analysis ?? null;
  const coaching = report?.coaching ?? null;
  const metrics = report?.metrics ?? null;
  const sectionBreakdown = asArray<SectionBreakdown>(analysis?.script_section_breakdown);
  const deviations = asArray<Record<string, unknown>>(analysis?.script_deviations);
  const violations = asArray<Record<string, unknown>>(analysis?.compliance_violations);
  const missedRebuttals = asArray<MissedRebuttal>(coaching?.missed_rebuttals);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">QualiCall</h1>
            <Badge variant="secondary">AI Call QA</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Upload scripts and call recordings to generate transcripts, scorecards,
            compliance analysis, and coaching reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-lg border border-border px-2.5 py-1">
            API: {API_BASE}
          </span>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ApiConnectionCard
          health={health}
          loading={healthLoading}
          error={healthError}
          tone={healthTone}
          onRetry={loadHealth}
        />
        <ProcessingCard
          callId={activeCallId}
          status={status}
          loading={statusLoading}
          error={statusError}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              Script Library
            </CardTitle>
            <CardDescription>
              Upload a campaign script, then choose it for call analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid gap-3" onSubmit={handleScriptUpload}>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Script name</span>
                <input
                  className={inputClassName}
                  value={scriptName}
                  onChange={(event) => setScriptName(event.target.value)}
                  placeholder="March outbound campaign"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Script file</span>
                <input
                  className={fileInputClassName}
                  type="file"
                  accept=".txt,.pdf,.docx"
                  onChange={(event) => {
                    setScriptFile(event.target.files?.[0] ?? null);
                  }}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={scriptUploading}>
                  {scriptUploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Upload script
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadScripts()}
                  disabled={scriptsLoading}
                >
                  <RefreshCw className={cn('size-4', scriptsLoading && 'animate-spin')} />
                  Refresh
                </Button>
              </div>
            </form>

            {scriptsError ? <ErrorMessage message={scriptsError} /> : null}

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Available scripts</span>
              <select
                className={inputClassName}
                value={selectedScriptId}
                onChange={(event) => setSelectedScriptId(event.target.value)}
              >
                <option value="">
                  {scriptsLoading ? 'Loading scripts...' : 'Select a script'}
                </option>
                {scripts.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.name}
                  </option>
                ))}
              </select>
            </label>

            {uploadedScript ? (
              <ParsedSectionsPreview script={uploadedScript} />
            ) : (
              <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                Prefer `.txt` scripts for fastest parsing. Uploaded sections appear
                here after the backend parses the script.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileAudio className="size-4" />
              Analyze Call
            </CardTitle>
            <CardDescription>
              Upload a recording and start the asynchronous QA pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={handleCallUpload}>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Audio file</span>
                <input
                  className={fileInputClassName}
                  type="file"
                  accept=".mp3,.wav,.m4a,.ogg,.flac,.mp4"
                  onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Agent name</span>
                  <input
                    className={inputClassName}
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                    placeholder="Jane Smith"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Script</span>
                  <select
                    className={inputClassName}
                    value={selectedScriptId}
                    onChange={(event) => setSelectedScriptId(event.target.value)}
                  >
                    <option value="">Select script</option>
                    {scripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm sm:col-span-2">
                  <span className="font-medium">Call purpose</span>
                  <input
                    className={inputClassName}
                    value={callPurpose}
                    onChange={(event) => setCallPurpose(event.target.value)}
                    placeholder="Outbound renewal"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Agent speaker</span>
                  <select
                    className={inputClassName}
                    value={agentSpeakerLabel}
                    onChange={(event) => setAgentSpeakerLabel(event.target.value)}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Compliance phrases</span>
                <textarea
                  className={cn(inputClassName, 'min-h-24 resize-y py-2')}
                  value={compliancePhrases}
                  onChange={(event) => setCompliancePhrases(event.target.value)}
                  placeholder={'guaranteed approval\n100% free money'}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Expected duration seconds</span>
                <input
                  className={inputClassName}
                  type="number"
                  min="1"
                  value={expectedDuration}
                  onChange={(event) => setExpectedDuration(event.target.value)}
                  placeholder="300"
                />
              </label>
              {callError ? <ErrorMessage message={callError} /> : null}
              <Button type="submit" disabled={callUploading}>
                {callUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="size-4" />
                )}
                Upload and analyze
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Completed calls render transcript, scorecard, analysis, and coaching.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {RESULT_TABS.map((tab) => (
                <Button
                  key={tab}
                  type="button"
                  size="sm"
                  variant={resultTab === tab ? 'default' : 'outline'}
                  onClick={() => setResultTab(tab)}
                >
                  {tab}
                </Button>
              ))}
            </div>
            {resultsLoading ? (
              <LoadingState label="Loading report..." />
            ) : resultsError ? (
              <ErrorMessage message={resultsError} />
            ) : !activeCallId ? (
              <EmptyState label="Select or upload a call to see results." />
            ) : status?.status !== 'complete' ? (
              <EmptyState label="Results become available after processing completes." />
            ) : (
              <ResultsPanel
                tab={resultTab}
                transcript={transcript}
                scorecard={scorecard}
                metrics={metrics}
                analysis={analysis}
                coaching={coaching}
                sectionBreakdown={sectionBreakdown}
                deviations={deviations}
                violations={violations}
                missedRebuttals={missedRebuttals}
              />
            )}
          </CardContent>
        </Card>

        <HistoryCard
          history={history}
          loading={historyLoading}
          error={historyError}
          activeCallId={activeCallId}
          onRefresh={loadHistory}
          onSelect={selectHistoryCall}
        />
      </section>
    </div>
  );
}

function ApiConnectionCard({
  health,
  loading,
  error,
  tone,
  onRetry,
}: {
  health: HealthPayload | null;
  loading: boolean;
  error: string | null;
  tone: 'success' | 'danger' | 'neutral';
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div>
          <CardTitle>API Connection</CardTitle>
          <CardDescription>
            Render may take 30 to 60 seconds to wake after inactivity.
          </CardDescription>
        </div>
        <StatusBadge value={loading ? 'Checking' : health?.status ?? 'Unavailable'} tone={tone} />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <LoadingState label="Checking QualiCall health..." compact />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <MetricPill label="Service" value={health?.status ?? 'unknown'} />
            <MetricPill label="Database" value={health?.db ?? 'unknown'} />
            <MetricPill label="Result" value={String(health?.db_result ?? '-')} />
          </div>
        )}
        <Button type="button" variant="outline" onClick={onRetry} disabled={loading}>
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          Retry health check
        </Button>
      </CardContent>
    </Card>
  );
}

function ProcessingCard({
  callId,
  status,
  loading,
  error,
}: {
  callId: string | null;
  status: CallStatusPayload | null;
  loading: boolean;
  error: string | null;
}) {
  const current = status?.status ?? '';
  const activeIndex = current === 'failed' ? -1 : PIPELINE_STEPS.indexOf(current as never);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Status</CardTitle>
        <CardDescription>
          Polls every 4 seconds until the call is complete or failed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            value={current || (callId ? 'loading' : 'idle')}
            tone={current === 'failed' ? 'danger' : current === 'complete' ? 'success' : 'neutral'}
          />
          {loading ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Updating
            </span>
          ) : null}
          {callId ? (
            <span className="font-mono text-xs text-muted-foreground">{callId}</span>
          ) : null}
        </div>
        {error ? <ErrorMessage message={error} /> : null}
        {status?.error_message ? <ErrorMessage message={status.error_message} /> : null}
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE_STEPS.map((step, index) => {
            const complete = activeIndex >= index || current === 'complete';
            const active = current === step;
            return (
              <li
                key={step}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2 text-xs',
                  complete
                    ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'
                    : 'border-border bg-card text-muted-foreground',
                  active && 'ring-2 ring-primary/20',
                )}
              >
                {complete ? (
                  <CheckCircle2 className="size-4 shrink-0" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border border-current" />
                )}
                <span className="capitalize">{step}</span>
              </li>
            );
          })}
          {current === 'failed' ? (
            <li className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              Failed
            </li>
          ) : null}
        </ol>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <MetricPill label="Created" value={formatDate(status?.created_at)} />
          <MetricPill label="Completed" value={formatDate(status?.completed_at)} />
        </div>
      </CardContent>
    </Card>
  );
}

function ParsedSectionsPreview({ script }: { script: ScriptUploadResult }) {
  const sections = asArray<ScriptSection>(script.sections);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{script.name}</p>
          <p className="text-xs text-muted-foreground">
            {script.sections_parsed ?? sections.length} sections parsed
          </p>
        </div>
        <Badge variant="outline">{script.script_id.slice(0, 8)}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {sections.length > 0 ? (
          sections.slice(0, 4).map((section, index) => (
            <div key={`${section.section_number ?? index}-${section.title ?? index}`} className="rounded-lg bg-muted/40 p-2">
              <p className="text-sm font-medium">
                {section.section_number ? `${section.section_number}. ` : ''}
                {section.title ?? 'Untitled section'}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {section.required_info ?? section.type ?? 'No section detail returned.'}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No parsed sections returned.</p>
        )}
      </div>
    </div>
  );
}

function ResultsPanel({
  tab,
  transcript,
  scorecard,
  metrics,
  analysis,
  coaching,
  sectionBreakdown,
  deviations,
  violations,
  missedRebuttals,
}: {
  tab: ResultTab;
  transcript: TranscriptTurn[];
  scorecard: ScorecardPayload | null;
  metrics: MetricsPayload | null;
  analysis: ReportAnalysis | null;
  coaching: CoachingPayload | null;
  sectionBreakdown: SectionBreakdown[];
  deviations: Record<string, unknown>[];
  violations: Record<string, unknown>[];
  missedRebuttals: MissedRebuttal[];
}) {
  switch (tab) {
    case 'Transcript':
      return <TranscriptView transcript={transcript} />;
    case 'Scorecard':
      return <ScorecardView scorecard={scorecard} metrics={metrics} />;
    case 'Analysis':
      return (
        <AnalysisView
          analysis={analysis}
          sectionBreakdown={sectionBreakdown}
          deviations={deviations}
          violations={violations}
        />
      );
    case 'Coaching':
      return <CoachingView coaching={coaching} missedRebuttals={missedRebuttals} />;
  }
}

function TranscriptView({ transcript }: { transcript: TranscriptTurn[] }) {
  if (transcript.length === 0) {
    return <EmptyState label="Transcript is empty or not available yet." />;
  }
  return (
    <div className="max-h-[560px] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
      {transcript.map((turn, index) => {
        const isAgent = turn.speaker_role === 'agent';
        return (
          <div
            key={`${turn.turn_index ?? index}-${turn.start_ms ?? index}`}
            className={cn('flex', isAgent ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[82%] rounded-xl border p-3 text-sm',
                isAgent
                  ? 'border-primary/20 bg-primary text-primary-foreground'
                  : 'border-border bg-card',
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                <span className="font-medium capitalize">
                  {turn.speaker_role ?? `Speaker ${turn.speaker_label ?? '?'}`}
                </span>
                <span>{formatMs(turn.start_ms)}</span>
                {turn.sentiment ? <span>{turn.sentiment}</span> : null}
              </div>
              <p className="leading-6">{turn.text || 'No text returned.'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScorecardView({
  scorecard,
  metrics,
}: {
  scorecard: ScorecardPayload | null;
  metrics: MetricsPayload | null;
}) {
  const rows = [
    ['Overall score', scorecard?.overall_score],
    ['Script adherence', scorecard?.script_adherence_score],
    ['Communication sentiment', scorecard?.communication_sentiment_score],
    ['Objection/refusal', scorecard?.objection_refusal_score],
    ['Outcome', scorecard?.call_outcome_score],
    ['Professionalism', scorecard?.professionalism_score],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricPill label="Compliance gate" value={scorecard?.compliance_gate_passed === false ? 'Failed' : scorecard?.compliance_gate_passed === true ? 'Passed' : '-'} />
        <MetricPill label="Duration" value={formatSeconds(metrics?.duration_seconds)} />
        <MetricPill label="Talk ratio" value={ratioLabel(metrics?.agent_talk_ratio, metrics?.customer_talk_ratio)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <ScoreBar key={label} label={label} value={value} />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MetricPill label="Agent interruptions" value={formatNumber(metrics?.agent_interruptions)} />
        <MetricPill label="Customer interruptions" value={formatNumber(metrics?.customer_interruptions)} />
        <MetricPill label="Filler words" value={formatNumber(metrics?.filler_word_count)} />
        <MetricPill label="Talk/listen flag" value={metrics?.talk_to_listen_ratio_flag ?? '-'} />
      </div>
    </div>
  );
}

function AnalysisView({
  analysis,
  sectionBreakdown,
  deviations,
  violations,
}: {
  analysis: ReportAnalysis | null;
  sectionBreakdown: SectionBreakdown[];
  deviations: Record<string, unknown>[];
  violations: Record<string, unknown>[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricPill label="Compliance" value={analysis?.compliance_passed === false ? 'Failed' : analysis?.compliance_passed === true ? 'Passed' : '-'} />
        <MetricPill label="Escalation risk" value={analysis?.escalation_risk === true ? 'Yes' : analysis?.escalation_risk === false ? 'No' : '-'} />
        <MetricPill label="Resolution confidence" value={formatScore(analysis?.resolution_confidence_score)} />
      </div>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Sentiment Summary</CardTitle>
          <CardDescription>
            {analysis?.customer_emotional_outcome ?? 'No emotional outcome returned.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            {analysis?.sentiment_summary ?? 'No sentiment summary returned.'}
          </p>
          {analysis?.escalation_risk_reason ? (
            <p className="mt-2 text-sm text-destructive">
              {analysis.escalation_risk_reason}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Section</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Coverage</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sectionBreakdown.length > 0 ? (
              sectionBreakdown.map((section, index) => (
                <TableRow key={`${section.section_number ?? index}-${section.title ?? index}`}>
                  <TableCell className="font-medium">
                    {section.section_number ? `${section.section_number}. ` : ''}
                    {section.title ?? 'Untitled'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={section.status ?? '-'} tone="neutral" />
                  </TableCell>
                  <TableCell>{formatScore(section.coverage_score)}</TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">
                    {section.evidence ?? section.notes ?? '-'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No script section breakdown returned.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <JsonList title="Deviations" rows={deviations} emptyLabel="No deviations returned." />
      <JsonList title="Compliance Violations" rows={violations} emptyLabel="No compliance violations returned." />
    </div>
  );
}

function CoachingView({
  coaching,
  missedRebuttals,
}: {
  coaching: CoachingPayload | null;
  missedRebuttals: MissedRebuttal[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <InsightCard title="What went well" body={coaching?.what_went_well} tone="success" />
        <InsightCard title="Where points were lost" body={coaching?.where_lost_points} tone="warning" />
        <InsightCard title="Sentiment pattern" body={coaching?.sentiment_pattern_summary} tone="neutral" />
        <InsightCard title="Priority focus" body={coaching?.priority_focus} tone="danger" />
      </div>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Missed Rebuttals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {missedRebuttals.length > 0 ? (
            missedRebuttals.map((item, index) => (
              <div key={`${item.customer_said ?? index}`} className="rounded-lg border border-border p-3">
                <p className="text-sm">
                  <span className="font-medium">Customer said:</span>{' '}
                  {item.customer_said ?? '-'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Agent did:</span>{' '}
                  {item.agent_did ?? '-'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Should have said:</span>{' '}
                  {item.should_have_said ?? '-'}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No missed rebuttals returned.</p>
          )}
        </CardContent>
      </Card>
      {coaching?.full_report_md ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Full Coaching Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-6">
              {coaching.full_report_md}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function HistoryCard({
  history,
  loading,
  error,
  activeCallId,
  onRefresh,
  onSelect,
}: {
  history: RecentCall[];
  loading: boolean;
  error: string | null;
  activeCallId: string | null;
  onRefresh: () => void;
  onSelect: (callId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div>
          <CardTitle>Recent Calls</CardTitle>
          <CardDescription>Newest 50 calls from QualiCall.</CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <ErrorMessage message={error} /> : null}
        <div className="max-h-[620px] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Call</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <LoadingState label="Loading history..." compact />
                  </TableCell>
                </TableRow>
              ) : history.length > 0 ? (
                history.map((call) => (
                  <TableRow
                    key={call.id}
                    className={cn(
                      'cursor-pointer',
                      activeCallId === call.id && 'bg-muted/60',
                    )}
                    onClick={() => onSelect(call.id)}
                  >
                    <TableCell className="font-mono text-xs">{call.id.slice(0, 8)}</TableCell>
                    <TableCell>{call.agent_name ?? '-'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        value={call.status ?? '-'}
                        tone={call.status === 'complete' ? 'success' : call.status === 'failed' ? 'danger' : 'neutral'}
                      />
                    </TableCell>
                    <TableCell>{formatScore(call.overall_score)}</TableCell>
                    <TableCell>{formatDate(call.created_at)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No calls returned yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  const pct = clampScore(value);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm">{formatScore(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full',
            pct >= 75 ? 'bg-emerald-600' : pct >= 50 ? 'bg-amber-500' : 'bg-destructive',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function JsonList({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: Record<string, unknown>[];
  emptyLabel: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <pre
              key={index}
              className="overflow-auto rounded-lg bg-muted/40 p-3 text-xs leading-5"
            >
              {JSON.stringify(row, null, 2)}
            </pre>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

function InsightCard({
  title,
  body,
  tone,
}: {
  title: string;
  body?: string | null;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  return (
    <div className={cn('rounded-lg border p-3', toneClass(tone))}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body || 'Not returned yet.'}</p>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

function StatusBadge({
  value,
  tone = 'neutral',
}: {
  value: string;
  tone?: 'success' | 'danger' | 'neutral';
}) {
  return (
    <Badge variant="outline" className={toneClass(tone)}>
      <span className="capitalize">{value}</span>
    </Badge>
  );
}

function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', !compact && 'py-8')}>
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

async function apiJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...fetchInit } = init;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchInit,
      signal: controller?.signal ?? fetchInit.signal,
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error('QualiCall returned a malformed response.');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The QualiCall API is taking longer than expected. Render may be waking up, so retry in a moment.');
    }
    throw error;
  } finally {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
  }
}

async function responseErrorMessage(response: Response): Promise<string> {
  const fallback = statusFallback(response.status, response.statusText);
  const rawText = await response.text().catch(() => '');
  if (!rawText.trim()) {
    return fallback;
  }

  try {
    const body = JSON.parse(rawText) as unknown;
    if (isRecord(body) && 'detail' in body) {
      const detail = body.detail;
      if (typeof detail === 'string') {
        return `${fallback}: ${detail}`;
      }
      if (Array.isArray(detail)) {
        return `${fallback}: ${detail
          .map((item) =>
            isRecord(item) && typeof item.msg === 'string' ? item.msg : JSON.stringify(item),
          )
          .join(', ')}`;
      }
      if (detail !== null && detail !== undefined) {
        return `${fallback}: ${JSON.stringify(detail)}`;
      }
    }
  } catch {
    return `${fallback}: ${rawText.trim()}`;
  }
  return fallback;
}

function statusFallback(status: number, statusText: string): string {
  switch (status) {
    case 400:
      return 'Bad request';
    case 404:
      return 'Not found';
    case 413:
      return 'File too large';
    case 422:
      return 'Missing or invalid form fields';
    case 500:
      return 'QualiCall server error';
    default:
      return statusText || `Request failed (${status})`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function formatMs(value?: number | null): string {
  if (typeof value !== 'number') {
    return '--:--';
  }
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatSeconds(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatScore(value?: number | null): string {
  return typeof value === 'number' ? value.toFixed(1) : '-';
}

function formatNumber(value?: number | null): string {
  return typeof value === 'number' ? String(value) : '-';
}

function ratioLabel(agent?: number | null, customer?: number | null): string {
  if (typeof agent !== 'number' || typeof customer !== 'number') {
    return '-';
  }
  return `${Math.round(agent * 100)}:${Math.round(customer * 100)}`;
}

function clampScore(value?: number | null): number {
  if (typeof value !== 'number') {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

function toneClass(tone: 'success' | 'warning' | 'danger' | 'neutral'): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300';
    case 'warning':
      return 'border-amber-600/40 bg-amber-600/10 text-amber-800 dark:text-amber-300';
    case 'danger':
      return 'border-destructive/40 bg-destructive/10 text-destructive';
    case 'neutral':
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

const inputClassName =
  'h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:opacity-60';

const fileInputClassName =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm file:font-medium';
