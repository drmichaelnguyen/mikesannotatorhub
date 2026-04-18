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
