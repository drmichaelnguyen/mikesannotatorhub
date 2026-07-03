/** True when an embedded rich-text image src is a browser-only blob URL (not persisted). */
export function isTemporaryBlobImageSrc(src: string | null | undefined): boolean {
  return Boolean(src?.trim().toLowerCase().startsWith("blob:"));
}

export function hasTemporaryBlobImages(html: string | null | undefined): boolean {
  if (!html) return false;
  return /src=["']blob:/i.test(html);
}
