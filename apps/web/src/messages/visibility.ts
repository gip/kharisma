import type { KharismaSenderSummary } from "@/backend/types";

export type MessageVisibility = "all" | "human";

export function isVisibleSender(
  sender: KharismaSenderSummary | null | undefined,
  visibility: MessageVisibility,
) {
  return visibility === "all" || sender?.role === "H";
}

export function visibleHumanSenderInboxIds(
  senders: readonly KharismaSenderSummary[],
) {
  return senders
    .filter((sender) => isVisibleSender(sender, "human"))
    .map((sender) => sender.inboxId);
}
