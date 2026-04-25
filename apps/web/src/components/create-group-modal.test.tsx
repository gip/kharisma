import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { CreateGroupModal } from "./create-group-modal";
import { I18nProvider } from "@/i18n/i18n-provider";
import { en } from "@/i18n/en";
import {
  extractVideoThumbnail,
  normalizeVideoToPortrait,
} from "@/media/portrait-video";

vi.mock("@/media/portrait-video", () => ({
  extractVideoThumbnail: vi.fn(),
  normalizeVideoToPortrait: vi.fn(),
}));

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>);
}

describe("CreateGroupModal", () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:thumb");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("normalizes selected videos before submit and thumbnail generation", async () => {
    const rawFile = new File(["raw"], "desktop.mp4", { type: "video/mp4" });
    const normalizedFile = new File(["normalized"], "desktop-portrait.webm", {
      type: "video/webm",
    });
    const thumbnailFile = new File(["thumb"], "thumb.jpg", {
      type: "image/jpeg",
    });
    const onCreate = vi.fn().mockResolvedValue(true);

    vi.mocked(normalizeVideoToPortrait).mockResolvedValue(normalizedFile);
    vi.mocked(extractVideoThumbnail).mockResolvedValue(thumbnailFile);

    const { container } = renderWithI18n(
      <CreateGroupModal
        open
        busy={false}
        environment="web"
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    const fileInput = container.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Expected file input to be present.");
    }

    fireEvent.change(fileInput, {
      target: { files: [rawFile] },
    });

    await waitFor(() => {
      expect(normalizeVideoToPortrait).toHaveBeenCalledWith(rawFile);
      expect(extractVideoThumbnail).toHaveBeenCalledWith(normalizedFile);
    });

    fireEvent.change(
      screen.getByPlaceholderText(en["createGroup.namePlaceholder"]),
      {
        target: { value: "Portrait Club" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText(en["createGroup.descriptionPlaceholder"]),
      {
        target: { value: "This description is long enough to submit." },
      },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "EN" })[0]);
    fireEvent.click(
      screen.getByRole("button", { name: en["createGroup.create"] }),
    );

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        "Portrait Club",
        "This description is long enough to submit.",
        normalizedFile,
        thumbnailFile,
        ["en"],
        "H_ONLY",
        "NONE",
        12,
      );
    });
  });
});
