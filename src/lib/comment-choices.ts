export type CommentChoiceMode = "FREE" | "DROPDOWN" | "MULTI";

export type FieldCommentConfig = {
  mode: CommentChoiceMode;
  choices: string[];
  /** When true, annotator cannot submit the case without filling this field. */
  mandatory: boolean;
  /** When true, a note on this field must include ≥1 image. */
  requireImage: boolean;
};

export function parseCommentChoiceMode(raw: string | null | undefined): CommentChoiceMode {
  const mode = (raw ?? "").trim().toUpperCase();
  if (mode === "DROPDOWN" || mode === "MULTI") return mode;
  return "FREE";
}

export function parseCommentChoices(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean))];
}

/** Effective mode: DROPDOWN/MULTI only when there is at least one choice. */
export function effectiveCommentChoiceMode(
  mode: CommentChoiceMode,
  choices: string[],
): CommentChoiceMode {
  if (choices.length === 0) return "FREE";
  return mode;
}

export function joinMultiCommentChoices(selected: string[], extra = ""): string {
  const parts = [...selected.map((s) => s.trim()).filter(Boolean)];
  const extraTrim = extra.trim();
  if (extraTrim) parts.push(extraTrim);
  return parts.join("\n");
}

export function splitTemplateRows(template: string | null | undefined): string[] {
  return (template ?? "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function emptyFieldCommentConfig(): FieldCommentConfig {
  return { mode: "FREE", choices: [], mandatory: true, requireImage: false };
}

/** True when saved JSON already uses per-field mandatory / requireImage keys. */
export function fieldConfigsHavePerFieldFlags(raw: string | null | undefined): boolean {
  return /"(requireImage|mandatory)"\s*:/.test(raw ?? "");
}

export function parseFieldCommentConfigs(raw: string | null | undefined): FieldCommentConfig[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (!item || typeof item !== "object") return emptyFieldCommentConfig();
      const row = item as {
        mode?: unknown;
        choices?: unknown;
        mandatory?: unknown;
        requireImage?: unknown;
      };
      const mode = parseCommentChoiceMode(typeof row.mode === "string" ? row.mode : "FREE");
      const choices = Array.isArray(row.choices)
        ? [...new Set(row.choices.map((c) => String(c).trim()).filter(Boolean))]
        : typeof row.choices === "string"
          ? parseCommentChoices(row.choices)
          : [];
      return {
        mode: effectiveCommentChoiceMode(mode, choices),
        choices: mode === "FREE" ? [] : choices,
        mandatory: row.mandatory === false ? false : true,
        requireImage: row.requireImage === true,
      };
    });
  } catch {
    return [];
  }
}

export function serializeFieldCommentConfigs(configs: FieldCommentConfig[]): string {
  return JSON.stringify(
    configs.map((cfg) => {
      const mode = parseCommentChoiceMode(cfg.mode);
      const choices =
        mode === "FREE"
          ? []
          : [...new Set(cfg.choices.map((c) => c.trim()).filter(Boolean))];
      return {
        mode: effectiveCommentChoiceMode(mode, choices),
        choices,
        mandatory: cfg.mandatory !== false,
        requireImage: cfg.requireImage === true,
      };
    }),
  );
}

/**
 * One config per template row. Missing indexes inherit the legacy template-wide
 * mode/choices so older data keeps working until re-saved.
 * Older rows without per-field flags inherit `legacyRequireImagePerEntry` for images
 * and treat every field as mandatory.
 */
export function expandFieldCommentConfigs(
  template: string | null | undefined,
  fieldConfigsRaw: string | null | undefined,
  legacyMode: string | null | undefined,
  legacyChoices: string | null | undefined,
  legacyRequireImagePerEntry = false,
): FieldCommentConfig[] {
  const rows = splitTemplateRows(template);
  const parsed = parseFieldCommentConfigs(fieldConfigsRaw);
  const usesPerFieldFlags = fieldConfigsHavePerFieldFlags(fieldConfigsRaw);
  const legacy: FieldCommentConfig = {
    mode: parseCommentChoiceMode(legacyMode),
    choices: parseCommentChoices(legacyChoices),
    mandatory: true,
    requireImage: legacyRequireImagePerEntry,
  };
  const legacyEffective: FieldCommentConfig = {
    mode: effectiveCommentChoiceMode(legacy.mode, legacy.choices),
    choices: legacy.mode === "FREE" ? [] : legacy.choices,
    mandatory: true,
    requireImage: legacyRequireImagePerEntry,
  };

  return rows.map((_, index) => {
    const cfg = parsed[index];
    if (!cfg) return { ...legacyEffective, choices: [...legacyEffective.choices] };
    return {
      mode: effectiveCommentChoiceMode(cfg.mode, cfg.choices),
      choices: cfg.mode === "FREE" ? [] : [...cfg.choices],
      mandatory: usesPerFieldFlags ? cfg.mandatory !== false : true,
      requireImage: usesPerFieldFlags ? cfg.requireImage === true : legacyRequireImagePerEntry,
    };
  });
}

export function fieldIsMandatory(cfg: FieldCommentConfig | undefined): boolean {
  return cfg?.mandatory !== false;
}

export function fieldRequiresImage(cfg: FieldCommentConfig | undefined): boolean {
  return cfg?.requireImage === true;
}

/** Resolve input mode for a selected template row (or general/reply → free text). */
export function resolveCommentChoiceForField(
  fieldIndex: number | null | undefined,
  fieldConfigs: FieldCommentConfig[],
  legacyMode: CommentChoiceMode = "FREE",
  legacyChoices: string[] = [],
): { mode: CommentChoiceMode; choices: string[] } {
  if (fieldIndex == null || fieldIndex < 0) {
    return { mode: "FREE", choices: [] };
  }
  const cfg = fieldConfigs[fieldIndex];
  if (cfg) {
    return {
      mode: effectiveCommentChoiceMode(cfg.mode, cfg.choices),
      choices: cfg.choices,
    };
  }
  return {
    mode: effectiveCommentChoiceMode(legacyMode, legacyChoices),
    choices: legacyChoices,
  };
}
