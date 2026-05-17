export default async function AgentPlaceholderPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        Agent <span className="font-mono text-lg">{id}</span>
      </h1>
      <p className="text-muted-foreground text-sm">
        Full editor, versions, and test call ship in Phase 6.4+.
      </p>
    </div>
  );
}
