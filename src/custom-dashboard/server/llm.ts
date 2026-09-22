/**
 * Shared OpenAI access: every call here is a JSON-object chat completion.
 *
 * Callers: visualize.ts (chart generation), naming.ts (widget / dashboard
 * titles), daterange.ts (date-range fallback), suggestions.ts (persona starter
 * questions). All server-side.
 *
 * Plain fetch rather than the `openai` SDK so this feature adds no server-side
 * dependency to LM labs.
 */

import { settings } from "./config";
import { ApiError } from "./errors";

const COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

export const llmConfigured = () => Boolean(settings.openaiApiKey);

/** The raw JSON text of the model's reply. */
export async function jsonCompletion(opts: {
  model: string;
  system: string;
  user: string;
  temperature: number;
}): Promise<string> {
  if (!settings.openaiApiKey) {
    throw new ApiError("openai_not_configured", "CD_OPENAI_API_KEY is not set.", 503);
  }

  const resp = await fetch(COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
      temperature: opts.temperature,
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new ApiError("openai_error", `OpenAI returned ${resp.status}: ${text.slice(0, 300)}`, 502);
  }
  const body = JSON.parse(text) as { choices?: { message?: { content?: string | null } }[] };
  return body.choices?.[0]?.message?.content || "{}";
}
