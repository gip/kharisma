import { MiniKit } from "@worldcoin/minikit-js";
import { Permission } from "@worldcoin/minikit-js/commands";
import {
  ensureWorldAppNotificationPermission,
  openWorldAppCameraStream,
} from "./world-app-permissions";

vi.mock("@worldcoin/minikit-js", () => ({
  MiniKit: {
    isInstalled: vi.fn(),
    getPermissions: vi.fn(),
    requestPermission: vi.fn(),
  },
}));

const minikit = vi.mocked(MiniKit);

function setMediaDevices(getUserMedia: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: getUserMedia ? { getUserMedia } : undefined,
  });
}

describe("world-app-permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    minikit.isInstalled.mockReturnValue(true);
  });

  it("opens the camera stream directly when microphone permission is already granted", async () => {
    const stream = { getTracks: vi.fn(() => []) } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices(getUserMedia);
    minikit.getPermissions.mockResolvedValue({
      data: { permissions: { [Permission.Microphone]: true } },
    } as Awaited<ReturnType<typeof MiniKit.getPermissions>>);

    await expect(openWorldAppCameraStream()).resolves.toEqual({
      ok: true,
      stream,
    });

    expect(minikit.requestPermission).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: "user",
        width: { ideal: 720 },
        height: { ideal: 1280 },
      },
      audio: true,
    });
  });

  it("requests microphone permission before opening the camera stream", async () => {
    const stream = { getTracks: vi.fn(() => []) } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices(getUserMedia);
    minikit.getPermissions.mockResolvedValue({
      data: { permissions: { [Permission.Microphone]: false } },
    } as Awaited<ReturnType<typeof MiniKit.getPermissions>>);
    minikit.requestPermission.mockResolvedValue({
      data: {
        status: "success",
        permission: Permission.Microphone,
        timestamp: new Date().toISOString(),
        version: 1,
      },
      executedWith: "minikit",
    } as Awaited<ReturnType<typeof MiniKit.requestPermission>>);

    await expect(openWorldAppCameraStream()).resolves.toEqual({
      ok: true,
      stream,
    });

    expect(minikit.requestPermission).toHaveBeenCalledWith({
      permission: Permission.Microphone,
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("does not open camera when microphone permission is rejected", async () => {
    const getUserMedia = vi.fn();
    setMediaDevices(getUserMedia);
    minikit.getPermissions.mockResolvedValue({
      data: { permissions: { [Permission.Microphone]: false } },
    } as Awaited<ReturnType<typeof MiniKit.getPermissions>>);
    minikit.requestPermission.mockRejectedValue({ error_code: "user_rejected" });

    await expect(openWorldAppCameraStream()).resolves.toEqual({
      ok: false,
      messageKey: "recorder.microphoneRejected",
    });

    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("maps camera denial after permission success", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
    setMediaDevices(getUserMedia);
    minikit.getPermissions.mockResolvedValue({
      data: { permissions: { [Permission.Microphone]: true } },
    } as Awaited<ReturnType<typeof MiniKit.getPermissions>>);

    await expect(openWorldAppCameraStream()).resolves.toEqual({
      ok: false,
      messageKey: "recorder.cameraDenied",
    });
  });

  it("requests notification permission when missing", async () => {
    minikit.getPermissions.mockResolvedValue({
      data: { permissions: { [Permission.Notifications]: false } },
    } as Awaited<ReturnType<typeof MiniKit.getPermissions>>);
    minikit.requestPermission.mockResolvedValue({
      data: {
        status: "success",
        permission: Permission.Notifications,
        timestamp: new Date().toISOString(),
        version: 1,
      },
      executedWith: "minikit",
    } as Awaited<ReturnType<typeof MiniKit.requestPermission>>);

    await expect(ensureWorldAppNotificationPermission()).resolves.toEqual({
      granted: true,
    });
    expect(minikit.requestPermission).toHaveBeenCalledWith({
      permission: Permission.Notifications,
    });
  });

  it("maps unsupported notification permission", async () => {
    minikit.getPermissions.mockResolvedValue({
      data: { permissions: { [Permission.Notifications]: false } },
    } as Awaited<ReturnType<typeof MiniKit.getPermissions>>);
    minikit.requestPermission.mockRejectedValue({
      error_code: "unsupported_permission",
    });

    await expect(ensureWorldAppNotificationPermission()).resolves.toEqual({
      granted: false,
      messageKey: "notifications.unsupported",
    });
  });
});
