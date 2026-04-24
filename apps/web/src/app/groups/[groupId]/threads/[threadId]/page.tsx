import { ThreadScreen } from "@/components/thread-screen";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ groupId: string; threadId: string }>;
}) {
  const { groupId, threadId } = await params;
  return <ThreadScreen groupId={groupId} threadId={threadId} />;
}
