import { settings, validateSettings } from "@/custom-dashboard/server/config";
import { route } from "@/custom-dashboard/server/http";
import * as resultCache from "@/custom-dashboard/server/resultCache";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({
  status: "ok",
  upstream: settings.lmApiBase,
  openaiConfigured: Boolean(settings.openaiApiKey),
  problems: validateSettings(),
  cache: resultCache.stats(),
}));
