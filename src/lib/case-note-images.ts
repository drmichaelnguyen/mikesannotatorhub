type MaybeNoteImageFields = {
  imageData?: string | null;
  imageDataListJson?: string | null;
};

export function getCaseNoteImages(note: MaybeNoteImageFields): string[] {
  const legacy = note.imageData?.trim() ? [note.imageData.trim()] : [];
  if (!note.imageDataListJson?.trim()) return legacy;
  try {
    const parsed = JSON.parse(note.imageDataListJson) as unknown;
    if (!Array.isArray(parsed)) return legacy;
    const list = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return list.length > 0 ? list : legacy;
  } catch {
    return legacy;
  }
}
