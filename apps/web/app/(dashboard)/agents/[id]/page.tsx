import { AgentEditorClient } from './agent-editor-client';

export default async function AgentEditorPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <AgentEditorClient agentId={id} />;
}
