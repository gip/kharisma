import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvestModal } from "./invest-modal";
import type { InvestmentConfig } from "@/backend/types";

function renderModal(input: {
  environment: "web" | "world-app" | "mobile-web";
  config: InvestmentConfig;
}) {
  return render(
    <InvestModal
      open
      groupId="group-1"
      syncInboxId="sync-inbox-1"
      environment={input.environment}
      getInvestmentConfig={vi.fn().mockResolvedValue(input.config)}
      submitInvestment={vi.fn()}
      onClose={vi.fn()}
      onRecorded={vi.fn()}
    />,
  );
}

describe("InvestModal", () => {
  it("explains when the groups service has no configured investment chains", async () => {
    renderModal({
      environment: "web",
      config: {
        destinationAddress: "0x2222222222222222222222222222222222222222",
        chains: [],
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Investment chains are not configured on the groups service.",
        ),
      ).toBeVisible();
    });
  });

  it("explains when the current wallet context chain is missing", async () => {
    renderModal({
      environment: "web",
      config: {
        destinationAddress: "0x2222222222222222222222222222222222222222",
        chains: [
          {
            chainId: 480,
            name: "world",
            tokens: [
              {
                token: "USDC",
                address: "0x3333333333333333333333333333333333333333",
                decimals: 6,
              },
            ],
          },
        ],
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Base investments are not configured for this context."),
      ).toBeVisible();
    });
  });
});
