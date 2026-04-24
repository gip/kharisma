"use client";

const PORTRAIT_ASPECT_RATIO = 4 / 5;
const PORTRAIT_ASPECT_TOLERANCE = 0.02;
const MAX_OUTPUT_WIDTH = 720;
const MAX_OUTPUT_HEIGHT = 900;
const DRAW_FRAME_RATE = 30;
const MEDIA_RECORDER_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OutputSize = {
  width: number;
  height: number;
};

type CaptureStreamCapableCanvas = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

type CaptureStreamCapableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export function getNormalizedVideoMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "video/webm";
  }

  for (const candidate of MEDIA_RECORDER_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "video/webm";
}

export function getVideoExtension(mimeType: string) {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

export function getPortraitCropRect(sourceWidth: number, sourceHeight: number): CropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Video dimensions must be positive.");
  }

  const sourceAspectRatio = sourceWidth / sourceHeight;

  if (sourceAspectRatio > PORTRAIT_ASPECT_RATIO) {
    const width = sourceHeight * PORTRAIT_ASPECT_RATIO;
    return {
      x: (sourceWidth - width) / 2,
      y: 0,
      width,
      height: sourceHeight,
    };
  }

  const height = sourceWidth / PORTRAIT_ASPECT_RATIO;
  return {
    x: 0,
    y: (sourceHeight - height) / 2,
    width: sourceWidth,
    height,
  };
}

export function getPortraitOutputSize(crop: CropRect): OutputSize {
  const scale = Math.min(
    1,
    MAX_OUTPUT_WIDTH / crop.width,
    MAX_OUTPUT_HEIGHT / crop.height,
  );

  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

function buildNormalizedVideoName(fileName: string, mimeType: string) {
  const extension = getVideoExtension(mimeType);
  const baseName = fileName.replace(/\.[^.]+$/, "") || "video";
  return `${baseName}-portrait.${extension}`;
}

function createVideoElement() {
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.muted = true;
  video.setAttribute("crossorigin", "anonymous");
  return video;
}

function waitForEvent(target: EventTarget, eventName: string) {
  return new Promise<void>((resolve) => {
    target.addEventListener(eventName, () => resolve(), { once: true });
  });
}

function loadVideoMetadata(video: HTMLVideoElement, url: string) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
    };

    const handleLoadedMetadata = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Failed to load video."));
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.src = url;
    video.load();
  });
}

function getCanvasCaptureStream(canvas: HTMLCanvasElement) {
  const capture = (canvas as CaptureStreamCapableCanvas).captureStream;
  if (!capture) return null;
  return capture.call(canvas, DRAW_FRAME_RATE);
}

function getVideoCaptureStream(video: HTMLVideoElement) {
  const captureVideo = video as CaptureStreamCapableVideo;
  if (captureVideo.captureStream) {
    return captureVideo.captureStream();
  }

  if (captureVideo.mozCaptureStream) {
    return captureVideo.mozCaptureStream();
  }

  return null;
}

// Safari on iOS does not implement HTMLVideoElement.captureStream(), so we
// cannot rebuild a decoded stream from an uploaded file there. In that case
// we return the source file unchanged rather than blocking the upload.
function canNormalizeViaPlayback() {
  if (typeof document === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  const canvas = document.createElement("canvas") as CaptureStreamCapableCanvas;
  if (typeof canvas.captureStream !== "function") return false;
  const probe = document.createElement("video") as CaptureStreamCapableVideo;
  return (
    typeof probe.captureStream === "function" ||
    typeof probe.mozCaptureStream === "function"
  );
}

function isAlreadyPortrait(width: number, height: number) {
  if (width <= 0 || height <= 0) return false;
  if (width > MAX_OUTPUT_WIDTH || height > MAX_OUTPUT_HEIGHT) return false;
  const aspect = width / height;
  return Math.abs(aspect - PORTRAIT_ASPECT_RATIO) <= PORTRAIT_ASPECT_TOLERANCE;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function cleanupVideoElement(video: HTMLVideoElement, url: string) {
  video.pause();
  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(url);
}

export async function normalizeVideoToPortrait(input: File): Promise<File> {
  // If the browser can't rebuild a stream from the file (iOS Safari), skip
  // normalization and use the original upload as-is.
  if (!canNormalizeViaPlayback()) {
    return input;
  }

  const url = URL.createObjectURL(input);
  const video = createVideoElement();

  let canvasStream: MediaStream | null = null;
  let videoStream: MediaStream | null = null;
  let outputStream: MediaStream | null = null;
  let animationFrame = 0;

  try {
    await loadVideoMetadata(video, url);

    // Fast path: already the target aspect and within size caps — no re-encode.
    if (isAlreadyPortrait(video.videoWidth, video.videoHeight)) {
      return input;
    }

    const crop = getPortraitCropRect(
      video.videoWidth || MAX_OUTPUT_WIDTH,
      video.videoHeight || MAX_OUTPUT_HEIGHT,
    );
    const outputSize = getPortraitOutputSize(crop);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("This browser cannot prepare portrait videos.");
    }

    canvas.width = outputSize.width;
    canvas.height = outputSize.height;

    canvasStream = getCanvasCaptureStream(canvas);
    videoStream = getVideoCaptureStream(video);
    if (!canvasStream || !videoStream) {
      return input;
    }
    outputStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...videoStream.getAudioTracks(),
    ]);

    const mimeType = getNormalizedVideoMimeType();
    const chunks: Blob[] = [];

    const recording = new Promise<File>((resolve, reject) => {
      const recorder = new MediaRecorder(outputStream!, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        reject(new Error("Failed to encode portrait video."));
      };

      recorder.onstop = () => {
        if (chunks.length === 0) {
          reject(new Error("Portrait video capture produced no data."));
          return;
        }

        resolve(
          new File(
            chunks,
            buildNormalizedVideoName(input.name, mimeType),
            { type: mimeType },
          ),
        );
      };

      const drawFrame = () => {
        context.drawImage(
          video,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );

        if (!video.paused && !video.ended) {
          animationFrame = requestAnimationFrame(drawFrame);
        }
      };

      // Start drawing and recording only once playback has actually begun,
      // so the encoder doesn't capture a blank leading frame.
      video
        .play()
        .then(() => {
          drawFrame();
          recorder.start(250);
          animationFrame = requestAnimationFrame(drawFrame);
        })
        .catch((error: unknown) => {
          reject(
            error instanceof Error
              ? error
              : new Error("Failed to play video."),
          );
        });

      void waitForEvent(video, "ended").then(() => {
        cancelAnimationFrame(animationFrame);
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      });
    });

    return await recording;
  } finally {
    cancelAnimationFrame(animationFrame);
    stopStream(outputStream);
    stopStream(videoStream);
    stopStream(canvasStream);
    cleanupVideoElement(video, url);
  }
}

export function extractVideoThumbnail(videoFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(videoFile);
    const video = createVideoElement();

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Thumbnail extraction timed out."));
    }, 8000);

    function cleanup() {
      clearTimeout(timeout);
      cleanupVideoElement(video, url);
    }

    video.addEventListener("canplay", () => {
      if (settled) return;
      // Some codecs reject currentTime=0.01 before a keyframe is decoded.
      // Aim slightly deeper — capped so short clips still land in-range.
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = duration > 0.2 ? Math.min(0.1, duration / 2) : 0;
      video.currentTime = target;
    });

    video.addEventListener("seeked", () => {
      if (settled) return;
      const canvas = document.createElement("canvas");
      const crop = getPortraitCropRect(
        video.videoWidth || MAX_OUTPUT_WIDTH,
        video.videoHeight || MAX_OUTPUT_HEIGHT,
      );
      const outputSize = getPortraitOutputSize(crop);

      canvas.width = outputSize.width;
      canvas.height = outputSize.height;

      const context = canvas.getContext("2d");
      if (!context) {
        settled = true;
        cleanup();
        reject(new Error("Failed to create thumbnail canvas."));
        return;
      }

      context.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      canvas.toBlob(
        (blob) => {
          if (settled) return;
          settled = true;
          cleanup();

          if (!blob) {
            reject(new Error("Failed to extract thumbnail."));
            return;
          }

          resolve(
            new File([blob], `thumb-${Date.now()}.jpg`, { type: "image/jpeg" }),
          );
        },
        "image/jpeg",
        0.85,
      );
    });

    video.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Failed to load video for thumbnail."));
    });

    video.src = url;
    video.load();
  });
}
