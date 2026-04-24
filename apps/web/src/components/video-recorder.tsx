"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/i18n-provider";
import {
  getNormalizedVideoMimeType,
  getPortraitCropRect,
  getPortraitOutputSize,
  getVideoExtension,
  normalizeVideoToPortrait,
} from "@/media/portrait-video";

type CaptureStreamCapableCanvas = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

const DRAW_FRAME_RATE = 30;

const CAMERA_DIMENSIONS = { width: 720, height: 1280 };

type VideoRecorderProps = {
  open: boolean;
  onClose: () => void;
  onRecorded: (file: File) => void;
};

export function VideoRecorder({ open, onClose, onRecorded }: VideoRecorderProps) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const normalizeTaskRef = useRef(0);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const drawFrameRef = useRef(0);

  const revokeReview = useCallback(() => {
    normalizeTaskRef.current += 1;
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewFile(null);
    setReviewUrl(null);
    setIsPreparingReview(false);
  }, [reviewUrl]);

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    if (drawFrameRef.current) {
      cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = 0;
    }
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach((track) => track.stop());
      captureStreamRef.current = null;
    }
    captureCanvasRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    stopRecorder();
  }, [stopRecorder]);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError(t("recorder.cameraDenied"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start camera when opened
  useEffect(() => {
    if (!open) {
      stopStream();
      revokeReview();
      setRecording(false);
      setElapsed(0);
      setError(null);
      setIsPreparingReview(false);
      return;
    }

    void startCamera();

    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Timer
  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);

  // Assign live stream to video element when entering camera mode from review
  useEffect(() => {
    if (!reviewUrl && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [reviewUrl]);

  function handleStartRecording() {
    if (!streamRef.current || !videoRef.current) return;
    chunksRef.current = [];

    const mimeType = getNormalizedVideoMimeType();
    const ext = getVideoExtension(mimeType);

    const sourceVideo = videoRef.current;
    const sourceStream = streamRef.current;
    const sourceWidth = sourceVideo.videoWidth || CAMERA_DIMENSIONS.width;
    const sourceHeight = sourceVideo.videoHeight || CAMERA_DIMENSIONS.height;
    const crop = getPortraitCropRect(sourceWidth, sourceHeight);
    const size = getPortraitOutputSize(crop);

    const canvas = document.createElement("canvas") as CaptureStreamCapableCanvas;
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");

    // Prefer recording a 4:5-cropped canvas so the upload is already portrait.
    // If canvas.captureStream isn't available, fall back to the raw camera
    // stream and let normalizeVideoToPortrait re-crop afterward.
    const recordStream =
      context && typeof canvas.captureStream === "function"
        ? new MediaStream([
            ...canvas.captureStream(DRAW_FRAME_RATE).getVideoTracks(),
            ...sourceStream.getAudioTracks(),
          ])
        : sourceStream;

    if (context && recordStream !== sourceStream) {
      captureCanvasRef.current = canvas;
      captureStreamRef.current = recordStream;
      const drawFrame = () => {
        context.drawImage(
          sourceVideo,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        drawFrameRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrameRef.current = requestAnimationFrame(drawFrame);
    }

    const recorder = new MediaRecorder(recordStream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      if (drawFrameRef.current) {
        cancelAnimationFrame(drawFrameRef.current);
        drawFrameRef.current = 0;
      }
      if (captureStreamRef.current) {
        captureStreamRef.current.getTracks().forEach((track) => track.stop());
        captureStreamRef.current = null;
      }
      captureCanvasRef.current = null;

      const blob = new Blob(chunksRef.current, { type: mimeType });
      const file = new File([blob], `video-${Date.now()}.${ext}`, { type: mimeType });
      const taskId = ++normalizeTaskRef.current;

      setIsPreparingReview(true);
      setError(null);

      try {
        const normalizedFile = await normalizeVideoToPortrait(file);
        if (normalizeTaskRef.current !== taskId) return;

        const url = URL.createObjectURL(normalizedFile);
        setReviewFile(normalizedFile);
        setReviewUrl(url);
      } catch {
        if (normalizeTaskRef.current !== taskId) return;
        setError("Failed to prepare portrait video.");
      } finally {
        if (normalizeTaskRef.current === taskId) {
          setIsPreparingReview(false);
        }
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }

  function handleSend() {
    if (reviewFile) {
      onRecorded(reviewFile);
    }
    revokeReview();
    stopStream();
  }

  function handleRedo() {
    revokeReview();
    // Camera stream is still alive — just go back to preview
    if (!streamRef.current) {
      void startCamera();
    }
  }

  function handleCancel() {
    revokeReview();
    stopStream();
    onClose();
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (!open) return null;

  const inReview = !!reviewUrl;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Modal card */}
      <div className="relative mx-4 flex w-full max-w-[340px] flex-col overflow-hidden rounded-3xl bg-[#1c1c1e] shadow-2xl">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={handleCancel}
            className="text-white/60 transition hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          {recording ? (
            <span className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-xs text-white/80">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {formatTime(elapsed)}
            </span>
          ) : null}
          {inReview ? (
            <span className="text-xs text-white/40">{t("recorder.review")}</span>
          ) : null}
        </div>

        {/* Video area — 4:5 aspect ratio */}
        <div className="relative aspect-[4/5] w-full bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-white/60">{error}</p>
            </div>
          ) : isPreparingReview ? (
            <div className="flex h-full items-center justify-center">
              <span className="spinner text-white/70" aria-hidden />
            </div>
          ) : inReview ? (
            <video
              key="review"
              ref={reviewVideoRef}
              src={reviewUrl}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <video
              key="live"
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-center gap-6 py-4">
          {inReview ? (
            <>
              {/* Cancel */}
              <button
                type="button"
                onClick={handleCancel}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition active:scale-95"
                aria-label={t("recorder.cancelLabel")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Send */}
              <button
                type="button"
                onClick={handleSend}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#34C759] transition active:scale-95"
                aria-label={t("recorder.sendLabel")}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>

              {/* Redo */}
              <button
                type="button"
                onClick={handleRedo}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition active:scale-95"
                aria-label={t("recorder.redoLabel")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4v6h6M23 20v-6h-6" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
              </button>
            </>
          ) : !recording ? (
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={!!error || isPreparingReview}
              className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-white/30 transition active:scale-95 disabled:opacity-40"
            >
              <div className="h-10 w-10 rounded-full bg-red-500" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopRecording}
              className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-red-500/50 transition active:scale-95"
            >
              <div className="h-5 w-5 rounded-sm bg-red-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
