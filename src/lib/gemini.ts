import "server-only";

/** Gemini access for the reply drafts (lib/draft.ts). */

/**
 * Google's cheapest current text tier. Override with GEMINI_MODEL.
 *
 * Not every model the API lists can actually be called: older ones (gemini-2.5-flash-lite)
 * stay in the catalogue but answer 404 "no longer available to new users", so pick a
 * replacement from the error message rather than from a listing.
 */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export const hasGeminiKey = () => !!process.env.GEMINI_API_KEY;

/**
 * One single-turn call. Returns the reply text, or null when no GEMINI_API_KEY is set or the
 * model returned nothing usable (e.g. it was blocked). Throws on an API or network error
 * (callers fall back to their non-AI version).
 */
export async function askGemini(opts: {
  system: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      // The key goes in a header, not the URL, so it can't end up in a request log
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    },
  );
  if (!res.ok) {
    // Google explains refusals properly ("use models/... instead"); a bare status hides that
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 300);
    try {
      detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? detail;
    } catch {
      // not JSON: the truncated body is the best we have
    }
    throw new Error(`Gemini API ${res.status} (model ${model}): ${detail}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  return text || null;
}
