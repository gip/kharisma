import { CircleScreen } from "@/components/circle-screen";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return <CircleScreen groupId={groupId} />;
}
