"use server";

import { GoogleGenAI } from "@google/genai";

type ExportTranslationNote = {
  id: string;
  content: string;
};

type ExportTranslationResult =
  | { ok: true; translated: { id: string; content: string }[] }
  | { ok: false; error: "unconfigured" | "failed" };

const exportTranslationModel =
  process.env.GEMINI_EXPORT_TRANSLATION_MODEL?.trim() || "gemini-2.5-flash";
const exportRetryCount = 3;
const exportRetryDelayMs = 900;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function normalizeExportNotes(notes: ExportTranslationNote[]) {
  return notes
    .map((note) => ({
      id: String(note.id ?? "").trim(),
      content: String(note.content ?? ""),
    }))
    .filter((note) => note.id.length > 0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : undefined;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return /UNAVAILABLE|503|rate limit|high demand|overloaded/i.test(message);
}

function parseStructuredTranslationResponse(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const jsonText =
    withoutFence.match(/\{[\s\S]*\}$/)?.[0] ??
    withoutFence.match(/\[[\s\S]*\]$/)?.[0] ??
    withoutFence;
  return JSON.parse(jsonText) as {
    items?: Array<{ id?: string; content?: string }>;
  };
}

export async function translateDiscussionForExportAction(
  notes: ExportTranslationNote[],
): Promise<ExportTranslationResult> {
  const normalized = normalizeExportNotes(notes);
  if (normalized.length === 0) return { ok: true, translated: [] };

  const client = getGeminiClient();
  if (!client) return { ok: false, error: "unconfigured" };

  for (let attempt = 0; attempt < exportRetryCount; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        model: exportTranslationModel,
        contents: JSON.stringify({ items: normalized }),
        config: {
          systemInstruction:
            "Translate case discussion comments into natural English for export. " +
            "Translate Vietnamese to English. Leave text that is already English unchanged. " +
            "Preserve line breaks, numbering, @mentions, IDs, URLs, and medical shorthand. " +
            'Return only valid JSON matching the requested schema.',
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    content: { type: "string" },
                  },
                  required: ["id", "content"],
                },
              },
            },
            required: ["items"],
          },
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      const raw = response.text ?? "";
      const parsed = parseStructuredTranslationResponse(raw);

      if (!Array.isArray(parsed.items)) {
        throw new Error("Translation response missing items array");
      }

      const translated = parsed.items
        .map((item) => ({
          id: String(item.id ?? "").trim(),
          content: String(item.content ?? ""),
        }))
        .filter((item) => item.id.length > 0);

      const byId = new Map(translated.map((item) => [item.id, item.content]));
      return {
        ok: true,
        translated: normalized.map((note) => ({
          id: note.id,
          content: byId.get(note.id) ?? note.content,
        })),
      };
    } catch (error) {
      const shouldRetry =
        attempt < exportRetryCount - 1 && isTransientGeminiError(error);
      if (shouldRetry) {
        await sleep(exportRetryDelayMs * (attempt + 1));
        continue;
      }
      console.error("Failed to translate discussion export", error);
      return { ok: false, error: "failed" };
    }
  }

  return { ok: false, error: "failed" };
}
