import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/i18n-provider";
import { openWorldAppCameraStream } from "@/media/world-app-permissions";
import { VideoRecorder } from "./video-recorder";

vi.mock("@/media/world-app-permissions", () => ({
  openWorldAppCameraStream: vi.fn(),
}));

const openWorldAppCameraStreamMock = vi.mocked(openWorldAppCameraStream);

describe("VideoRecorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the World App camera helper in World App mode", async () => {
    const stream = { getTracks: vi.fn(() => []) } as unknown as MediaStream;
    openWorldAppCameraStreamMock.mockResolvedValue({ ok: true, stream });

    render(
      <I18nProvider>
        <VideoRecorder
          open
          environment="world-app"
          onClose={vi.fn()}
          onRecorded={vi.fn()}
        />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(openWorldAppCameraStreamMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows World App permission errors from the camera helper", async () => {
    openWorldAppCameraStreamMock.mockResolvedValue({
      ok: false,
      messageKey: "recorder.microphoneRejected",
    });

    render(
      <I18nProvider>
        <VideoRecorder
          open
          environment="world-app"
          onClose={vi.fn()}
          onRecorded={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(
      await screen.findByText("Microphone access was declined."),
    ).toBeVisible();
  });
});
