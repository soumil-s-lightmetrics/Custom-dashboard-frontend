import { CHART_TYPES } from "@/custom-dashboard/server/chartTypes";
import { DATE_RANGES, settings } from "@/custom-dashboard/server/config";
import { route } from "@/custom-dashboard/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({
  user: { name: settings.userName },
  // Display only — the server always uses its own env values upstream, so a
  // tampered client cannot switch tenants.
  clientId: settings.clientId,
  fleetId: settings.fleetId,
  dateRanges: DATE_RANGES,
  dateRangePickerPrefill: settings.daterangePickerPrefill,
  chartTypes: CHART_TYPES.map(({ id, label }) => ({ id, label })),
}));
