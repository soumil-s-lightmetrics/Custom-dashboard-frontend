import { body, route } from "@/custom-dashboard/server/http";
import { getPersona, publicPersona } from "@/custom-dashboard/server/personas";
import { getSuggestions } from "@/custom-dashboard/server/suggestions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Resolve the chosen persona and its starter questions. null is the "Skip"
 * path and resolves to the generalist. Unlike the Flask route this no longer
 * writes the persona onto a dashboard — each dashboard now carries its own,
 * set when it is created from the picker.
 */
export const POST = route(async (req) => {
  const persona = getPersona((await body(req)).personaId);
  return { persona: publicPersona(persona), ...(await getSuggestions(persona.id, 3)) };
});
