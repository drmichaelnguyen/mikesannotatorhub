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
  const [pngUrl, setPngUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPngUrl(null);

    fetch(src, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.arrayBuffer();
      })
      .then(async (buffer) => {
        if (cancelled) return;
        const result = renderDicomToImageData(buffer);
        if (!result.ok) {
          setError(result.error);
          return;
        }

        // Prefer an <img> data URL so thumbs/full view paint reliably without canvas timing issues.
        const canvas = canvasRef.current ?? document.createElement("canvas");
        paintDicomOnCanvas(canvas, result.imageData);
        objectUrl = await new Promise<string>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("blob"));
                return;
              }
              resolve(URL.createObjectURL(blob));
            },
            "image/png",
          );
        });
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setPngUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load DICOM image.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (pngUrl) URL.revokeObjectURL(pngUrl);
    };
  }, [pngUrl]);

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
      {/* Hidden canvas used only for DICOM → PNG conversion. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      {loading && (
        <span className="absolute text-xs text-[var(--muted)]">
          {mode === "thumb" ? "…" : "Loading DICOM…"}
        </span>
      )}
      {pngUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pngUrl}
          alt={alt}
          className={
            mode === "thumb"
              ? "h-16 w-16 object-cover"
              : "max-h-[60vh] max-w-full object-contain"
          }
        />
      )}
    </div>
  );
}
