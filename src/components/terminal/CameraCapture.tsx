import { Button } from "@/components/ui/button";
import { Loader2, Video, VideoOff } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type CameraStatus = "idle" | "starting" | "live" | "error";

export interface CameraHandle {
  start: () => Promise<void>;
  stop: () => void;
  /** Capture the current frame as a JPEG Blob (or null when not live). */
  captureBlob: () => Promise<Blob | null>;
  captureDataUrl: () => string | null;
  status: CameraStatus;
}

interface CameraCaptureProps {
  className?: string;
  showControls?: boolean;
  mirror?: boolean;
  onStatusChange?: (status: CameraStatus, error?: string) => void;
}

function cameraErrorMessage(e: unknown): string {
  if (e instanceof DOMException) {
    switch (e.name) {
      case "NotAllowedError":
        return "Camera permission denied. Allow camera access for this site and try again.";
      case "NotFoundError":
        return "No camera device was found on this device.";
      case "NotReadableError":
        return "The camera is already in use by another application.";
      case "SecurityError":
        return "Camera access requires a secure (HTTPS) context.";
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : "Could not start the camera.";
}

export const CameraCapture = forwardRef<CameraHandle, CameraCaptureProps>(
  function CameraCapture(
    { className, showControls = true, mirror = true, onStatusChange },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [status, setStatus] = useState<CameraStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    const updateStatus = useCallback(
      (s: CameraStatus, err?: string) => {
        setStatus(s);
        setError(err ?? null);
        onStatusChange?.(s, err);
      },
      [onStatusChange],
    );

    const stop = useCallback(() => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      updateStatus("idle");
    }, [updateStatus]);

    const start = useCallback(async () => {
      if (streamRef.current) return;
      updateStatus("starting");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("unavailable", "SecurityError");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        updateStatus("live");
      } catch (e) {
        updateStatus("error", cameraErrorMessage(e));
      }
    }, [updateStatus]);

    const captureDataUrl = useCallback((): string | null => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.85);
    }, []);

    const captureBlob = useCallback(async (): Promise<Blob | null> => {
      const dataUrl = captureDataUrl();
      if (!dataUrl) return null;
      try {
        return await (await fetch(dataUrl)).blob();
      } catch {
        return null;
      }
    }, [captureDataUrl]);

    useImperativeHandle(
      ref,
      () => ({ start, stop, captureBlob, captureDataUrl, status }),
      [start, stop, captureBlob, captureDataUrl, status],
    );

    useEffect(() => () => stop(), [stop]);

    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="relative aspect-video overflow-hidden rounded-md border border-stone-300 bg-stone-900">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn("size-full object-cover", mirror && "-scale-x-100")}
          />
          <canvas ref={canvasRef} className="hidden" />
          {status !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-900 px-4 text-center">
              {status === "starting" ? (
                <>
                  <Loader2 className="size-6 animate-spin text-emerald-400" />
                  <p className="font-mono text-xs text-stone-400">
                    requesting camera access…
                  </p>
                </>
              ) : status === "error" ? (
                <>
                  <VideoOff className="size-6 text-red-400" />
                  <p className="max-w-xs font-mono text-[11px] leading-relaxed text-red-300">
                    {error}
                  </p>
                </>
              ) : (
                <>
                  <Video className="size-6 text-stone-500" />
                  <p className="font-mono text-[11px] text-stone-400">
                    [ camera idle — press START CAMERA ]
                  </p>
                </>
              )}
            </div>
          )}
          {status === "live" && (
            <span className="absolute top-2 right-2 flex items-center gap-1.5 rounded-sm bg-black/60 px-2 py-0.5 font-mono text-[10px] tracking-widest text-emerald-300">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              REC
            </span>
          )}
        </div>
        {showControls && (
          <div className="flex items-center gap-2">
            {status === "live" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={stop}
                className="gap-1.5 rounded-sm font-mono text-[11px]"
              >
                <VideoOff className="size-3.5" /> STOP CAMERA
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={start}
                disabled={status === "starting"}
                className="gap-1.5 rounded-sm font-mono text-[11px]"
              >
                <Video className="size-3.5" /> START CAMERA
              </Button>
            )}
            <span className="ml-auto font-mono text-[10px] text-stone-500">
              status: {status.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    );
  },
);
