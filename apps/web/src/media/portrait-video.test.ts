import {
  getNormalizedVideoMimeType,
  getPortraitCropRect,
  getPortraitOutputSize,
  getVideoExtension,
} from "./portrait-video";

describe("portrait-video", () => {
  it("center-crops landscape sources into a portrait frame", () => {
    expect(getPortraitCropRect(1920, 1080)).toEqual({
      x: 528,
      y: 0,
      width: 864,
      height: 1080,
    });
  });

  it("center-crops tall portrait sources to the shared aspect ratio", () => {
    expect(getPortraitCropRect(1080, 1920)).toEqual({
      x: 0,
      y: 285,
      width: 1080,
      height: 1350,
    });
  });

  it("scales normalized output down to the portrait cap without upscaling", () => {
    expect(
      getPortraitOutputSize({
        x: 0,
        y: 0,
        width: 1080,
        height: 1350,
      }),
    ).toEqual({ width: 720, height: 900 });

    expect(
      getPortraitOutputSize({
        x: 0,
        y: 0,
        width: 384,
        height: 480,
      }),
    ).toEqual({ width: 384, height: 480 });
  });

  it("uses one shared media-recorder mime negotiation path", () => {
    const originalMediaRecorder = globalThis.MediaRecorder;

    class MockMediaRecorder {
      static isTypeSupported(value: string) {
        return value === "video/webm";
      }
    }

    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    expect(getNormalizedVideoMimeType()).toBe("video/webm");
    expect(getVideoExtension("video/webm")).toBe("webm");
    expect(getVideoExtension("video/mp4")).toBe("mp4");

    vi.stubGlobal("MediaRecorder", originalMediaRecorder);
  });
});
