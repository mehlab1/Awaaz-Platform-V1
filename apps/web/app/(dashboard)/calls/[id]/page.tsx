import { CallDetailClient } from './call-detail-client';

export default async function CallDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <CallDetailClient callId={id} />;
}
