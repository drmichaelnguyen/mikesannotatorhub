"use client";

import { useEffect, useRef, useState } from "react";
import { isDicomFilename } from "@/lib/key-image-path";
import { paintDicomOnCanvas, renderDicomToImageData } from "@/lib/dicom-render";

export function KeyImageView({
  src,
  alt,
  className,
  mode = "full",
}: {
  src: string;
  alt: string;
  className?: string;
  mode?: "full" | "thumb";
}) {
  const isDicom = isDicomFilename(alt) || isDicomFilename(src);
  if (!isDicom) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={className} />
    );
  }
  return <DicomCanvas src={src} alt={alt} className={className} mode={mode} />;
}

function DicomCanvas({
  src,
  alt,
  className,
  mode,
}: {
  src: string;
  alt: string;
  className?: string;
  mode: "full" | "thumb";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(src)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;
        const result = renderDicomToImageData(buffer);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        paintDicomOnCanvas(canvas, result.imageData);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load DICOM image.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--bg)] p-2 text-center text-xs text-[var(--muted)] ${className ?? ""}`}
        title={alt}
      >
        {mode === "thumb" ? "DCM" : error}
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center ${className ?? ""}`}>
      {loading && (
        <span className="absolute text-xs text-[var(--muted)]">
          {mode === "thumb" ? "\u2026" : "Loading DICOM\u2026"}
        </span>
      )}
      <canvas
        ref={canvasRef}
        aria-label={alt}
        className={
          mode === "thumb"
            ? "h-16 w-16 object-cover"
            : "max-h-[60vh] max-w-full object-contain"
        }
        style={{ display: loading ? "none" : "block", maxWidth: "100%", height: "auto" }}
      />
    </div>
  );
}
