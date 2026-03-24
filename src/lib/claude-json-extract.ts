/**
 * Robust JSON extraction from Claude text (markdown fences, preamble, balanced `{...}`).
 */

/** First top-level `{ ... }` with balanced braces; respects strings and escapes. */
export function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const balanced = extractFirstBalancedJsonObject(trimmed);
    if (!balanced) return null;
    try {
      return JSON.parse(balanced) as unknown;
    } catch {
      return null;
    }
  }
}

/** Strip common markdown / preamble patterns, then parse JSON object from Claude output. */
export function tryParseJsonFromClaudeText(raw: string): unknown | null {
  const cleaned = raw
    .replace(/^[\s\S]*?```json\s*/i, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  return tryParseJsonObject(cleaned) ?? tryParseJsonObject(raw.trim());
}
