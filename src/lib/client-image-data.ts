export function getClipboardImageFile(data: DataTransfer | null | undefined): File | null {
  return getClipboardImageFiles(data)[0] ?? null;
}

export function getClipboardImageFiles(data: DataTransfer | null | undefined): File[] {
  const items = data?.items;
  if (!items?.length) return [];
  const files: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

export function readFileAsDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export async function readFilesAsDataUrls(files: Blob[]): Promise<string[]> {
  const results = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
  return results.filter((item): item is string => Boolean(item));
}

/** Resize and re-encode so embedded rich-text images stay small enough to save reliably. */
export async function compressImageForEmbed(
  file: Blob,
  maxWidth = 1200,
  quality = 0.85,
): Promise<string | null> {
  const dataUrl = await readFileAsDataUrl(file);
  if (!dataUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
