import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  CloudUpload,
  FileAudio,
  FileCheck2,
  FileText,
  Gauge,
  Headphones,
  HeartPulse,
  MessageSquareWarning,
  Mic2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  UserCheck,
  Volume2,
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

const stats = [
  {
    label: 'Calls Analysed',
    value: '1,284',
    detail: '+18% this week',
    icon: Headphones,
    tone: 'text-sky-700 bg-sky-500/10',
  },
  {
    label: 'Avg QA Score',
    value: '87.6',
    detail: 'Target 85+',
    icon: Gauge,
    tone: 'text-emerald-700 bg-emerald-500/10',
  },
  {
    label: 'Compliance Rate',
    value: '94.2%',
    detail: 'Across active campaigns',
    icon: ShieldCheck,
    tone: 'text-indigo-700 bg-indigo-500/10',
  },
  {
    label: 'Escalation Risks',
    value: '23',
    detail: 'Needs review',
    icon: AlertTriangle,
    tone: 'text-amber-700 bg-amber-500/10',
  },
  {
    label: 'Positive Sentiment %',
    value: '71%',
    detail: '+6.4% vs last period',
    icon: HeartPulse,
    tone: 'text-rose-700 bg-rose-500/10',
  },
  {
    label: 'Coaching Flags',
    value: '58',
    detail: '12 high priority',
    icon: UserCheck,
    tone: 'text-violet-700 bg-violet-500/10',
  },
];

const pipeline = [
  { label: 'Upload', icon: Upload },
  { label: 'Transcription', icon: FileAudio },
  { label: 'Sentiment', icon: HeartPulse },
  { label: 'Script Adherence', icon: ClipboardCheck },
  { label: 'Compliance', icon: ShieldCheck },
  { label: 'QA Score', icon: Gauge },
  { label: 'Coaching', icon: Sparkles },
];

const recentCalls = [
  {
    agent: 'Sirius',
    campaign: 'Inbound Sales',
    score: '92',
    sentiment: 'Positive',
    compliance: 'Pass',
    risk: 'Low',
    duration: '04:18',
    status: 'Reviewed',
  },
  {
    agent: 'Mina',
    campaign: 'Retention',
    score: '81',
    sentiment: 'Mixed',
    compliance: 'Pass',
    risk: 'Medium',
    duration: '06:42',
    status: 'Needs coaching',
  },
  {
    agent: 'Ray',
    campaign: 'Collections',
    score: '74',
    sentiment: 'Negative',
    compliance: 'Flagged',
    risk: 'High',
    duration: '05:09',
    status: 'Escalated',
  },
  {
    agent: 'Ayla',
    campaign: 'Onboarding',
    score: '89',
    sentiment: 'Positive',
    compliance: 'Pass',
    risk: 'Low',
    duration: '03:56',
    status: 'Reviewed',
  },
  {
    agent: 'Zain',
    campaign: 'Support QA',
    score: '85',
    sentiment: 'Neutral',
    compliance: 'Pass',
    risk: 'Low',
    duration: '07:21',
    status: 'Queued',
  },
];

const insightCards = [
  {
    title: 'Sentiment Arc',
    value: 'Positive close',
    detail: 'Conversation recovered after minute 3',
    progress: 76,
    icon: TrendingUp,
  },
  {
    title: 'Script Adherence',
    value: '88%',
    detail: 'Discovery and confirmation steps covered',
    progress: 88,
    icon: ClipboardCheck,
  },
  {
    title: 'Talk-to-Listen Ratio',
    value: '43:57',
    detail: 'Healthy listening balance',
    progress: 57,
    icon: Mic2,
  },
  {
    title: 'Interruption Count',
    value: '6',
    detail: 'Higher during objection handling',
    progress: 64,
    icon: MessageSquareWarning,
  },
  {
    title: 'Filler Words',
    value: '14',
    detail: 'Mostly during pricing explanation',
    progress: 42,
    icon: Volume2,
  },
  {
    title: 'Resolution Confidence',
    value: '91%',
    detail: 'Clear next steps detected',
    progress: 91,
    icon: CheckCircle2,
  },
];

const coachingInsights = [
  {
    title: 'Objection handling',
    text: 'You interrupted the customer 6 times during objection handling.',
    tone: 'border-amber-500/30 bg-amber-500/10',
  },
  {
    title: 'Empathy signal',
    text: 'Strong empathy detected during pricing discussion.',
    tone: 'border-emerald-500/30 bg-emerald-500/10',
  },
  {
    title: 'Opening compliance',
    text: 'Opening compliance statement was skipped.',
    tone: 'border-rose-500/30 bg-rose-500/10',
  },
];

const complianceAlerts = [
  {
    phrase: '"Guaranteed approval"',
    warning: 'Restricted claim detected in sales close.',
    severity: 'High',
  },
  {
    phrase: '"This is just a quick formality"',
    warning: 'Disclosure language may minimize customer consent.',
    severity: 'Medium',
  },
  {
    phrase: 'Missing recording notice',
    warning: 'Required opening statement was not found.',
    severity: 'High',
  },
];

const uploadMocks = [
  { label: 'Audio files', icon: FileAudio, detail: '.mp3, .wav, .m4a' },
  { label: 'Script files', icon: FileText, detail: 'Sales and support scripts' },
  { label: 'Rebuttal lists', icon: MessageSquareWarning, detail: 'Approved objection responses' },
  { label: 'Compliance phrases', icon: FileCheck2, detail: 'Required and blocked language' },
];

export default function QualicallPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">QualiCall</h1>
            <Badge variant="secondary">Preview</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            AI-powered call quality assurance, sentiment analysis, compliance
            monitoring, and coaching insights.
          </p>
        </div>
        <Button type="button" className="w-fit">
          <BarChart3 />
          Analyze Calls
        </Button>
      </header>

      <section aria-labelledby="qualicall-overview">
        <SectionHeading
          id="qualicall-overview"
          title="Overview"
          description="Static preview metrics for call quality monitoring."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {stats.map((stat) => (
            <Card key={stat.label} size="sm">
              <CardContent className="flex items-start gap-3">
                <div className={cn('flex size-9 items-center justify-center rounded-lg', stat.tone)}>
                  <stat.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {stat.value}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {stat.detail}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="qualicall-pipeline">
        <SectionHeading
          id="qualicall-pipeline"
          title="Processing Pipeline"
          description="A preview of the QA analysis stages."
        />
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {pipeline.map((step, index) => (
            <li key={step.label} className="relative">
              {index < pipeline.length - 1 ? (
                <div className="absolute left-[calc(100%-0.25rem)] top-8 z-0 hidden h-px w-4 bg-border 2xl:block" />
              ) : null}
              <div className="relative z-10 flex h-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <step.icon className="size-4" />
                </div>
                <span className="font-medium">{step.label}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="qualicall-recent">
        <SectionHeading
          id="qualicall-recent"
          title="Recent Call Analyses"
          description="Static sample rows for the preview dashboard."
        />
        <Card className="mt-3">
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>QA Score</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCalls.map((call) => (
                  <TableRow key={`${call.agent}-${call.campaign}`}>
                    <TableCell className="font-medium">{call.agent}</TableCell>
                    <TableCell>{call.campaign}</TableCell>
                    <TableCell className="tabular-nums">{call.score}</TableCell>
                    <TableCell>
                      <StatusBadge value={call.sentiment} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={call.compliance} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={call.risk} />
                    </TableCell>
                    <TableCell className="tabular-nums">{call.duration}</TableCell>
                    <TableCell className="text-muted-foreground">{call.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="qualicall-insights">
        <SectionHeading
          id="qualicall-insights"
          title="Analysis Insights"
          description="Representative QA signals from analysed conversations."
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {insightCards.map((insight) => (
            <Card key={insight.title}>
              <CardHeader className="grid-cols-[1fr_auto]">
                <div>
                  <CardTitle>{insight.title}</CardTitle>
                  <CardDescription>{insight.detail}</CardDescription>
                </div>
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <insight.icon className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-2xl font-semibold tabular-nums">
                  {insight.value}
                </div>
                <ProgressBar value={insight.progress} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]" aria-label="Coaching and compliance preview">
        <Card>
          <CardHeader>
            <CardTitle>Agent Coaching</CardTitle>
            <CardDescription>
              Sample coaching observations surfaced from call analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coachingInsights.map((insight) => (
              <div
                key={insight.text}
                className={cn('rounded-lg border p-3', insight.tone)}
              >
                <p className="text-sm font-medium">{insight.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{insight.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compliance Alerts</CardTitle>
            <CardDescription>
              Example flagged phrases and policy warnings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {complianceAlerts.map((alert) => (
              <div key={alert.phrase} className="flex gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{alert.phrase}</p>
                    <StatusBadge value={alert.severity} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {alert.warning}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="qualicall-upload">
        <SectionHeading
          id="qualicall-upload"
          title="Upload Mockup"
          description="A visual-only preview of the inputs QualiCall can analyse."
        />
        <Card className="mt-3 border-dashed">
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-background text-muted-foreground ring-1 ring-border">
                  <CloudUpload className="size-5" />
                </div>
                <p className="mt-3 font-medium">Drag and drop call QA inputs</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Audio, scripts, rebuttals, and compliance phrases appear here
                  in this frontend-only preview.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {uploadMocks.map((item) => (
                  <div key={item.label} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <item.icon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone = statusTone(value);

  return (
    <Badge variant="outline" className={tone}>
      {value}
    </Badge>
  );
}

function statusTone(value: string) {
  switch (value) {
    case 'Positive':
    case 'Pass':
    case 'Low':
    case 'Reviewed':
      return 'border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300';
    case 'Mixed':
    case 'Medium':
    case 'Queued':
      return 'border-amber-600/40 bg-amber-600/10 text-amber-800 dark:text-amber-300';
    case 'Negative':
    case 'Flagged':
    case 'High':
    case 'Escalated':
      return 'border-rose-600/40 bg-rose-600/10 text-rose-800 dark:text-rose-300';
    default:
      return 'text-muted-foreground';
  }
}
