import { Badge } from '@/components/ui/badge';

export default function QualicallPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Qualicall</h1>
        <Badge variant="secondary">Soon</Badge>
      </div>
      <p className="max-w-xl text-muted-foreground">Coming Soon</p>
    </div>
  );
}
