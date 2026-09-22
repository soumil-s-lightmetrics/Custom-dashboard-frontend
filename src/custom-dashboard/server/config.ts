/**
 * Server settings, read from the environment (.env* at the labs app root —
 * Next.js loads them). Port of backend/config.py.
 *
 * Inside LM labs every variable is namespaced with CD_ (CD_LM_ACCESS_TOKEN,
 * CD_CLIENT_ID, ...) so generic names like CLIENT_ID or USER_NAME can't clash
 * with other labs features. The names below are written without the prefix.
 */

const PREFIX = "CD_";

export const DATE_RANGES = [
  "Past 3 days",
  "Past 7 days",
  "Past 14 days",
  "Past 30 days",
  "Past 180 days",
] as const;

export type DateRange = (typeof DATE_RANGES)[number];

export function isDateRange(value: unknown): value is DateRange {
  return typeof value === "string" && (DATE_RANGES as readonly string[]).includes(value);
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[PREFIX + name] ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback = ""): string {
  return process.env[PREFIX + name] ?? fallback;
}

export const settings = {
  lmApiBase: str("LM_API_BASE").replace(/\/+$/, ""),
  lmAccessToken: str("LM_ACCESS_TOKEN"),
  lmReferer: str("LM_REFERER"),
  lmUserTimezone: str("LM_USER_TIMEZONE", "Asia/Calcutta"),

  clientId: str("CLIENT_ID"),
  fleetId: str("FLEET_ID"),

  openaiApiKey: str("OPENAI_API_KEY"),
  vizModel: str("VIZ_MODEL", "gpt-4o"),
  utilityModel: str("UTILITY_MODEL", "gpt-4o-mini"),

  daterangePickerPrefill: str("DATERANGE_PICKER_PREFILL", "Past 30 days"),
  userName: str("USER_NAME", "there"),
  suggestionTtlDays: int("SUGGESTION_TTL_DAYS", 7),

  upstreamConnectTimeout: int("UPSTREAM_CONNECT_TIMEOUT", 10),
  upstreamReadTimeout: int("UPSTREAM_READ_TIMEOUT", 180),

  dataDir: str("DASHBOARD_DATA_DIR", "data"),

  // Set a bucket to store everything in S3 (required on Amplify, whose server
  // instances share no disk). Unset -> local JSON files under dataDir.
  s3Bucket: str("S3_BUCKET"),
  // Empty -> the AWS SDK's default (AWS_REGION, which Amplify sets).
  s3Region: str("S3_REGION"),
  // "folder/" form; empty stores at the bucket root.
  s3Prefix: str("S3_PREFIX", "custom-dashboard/").replace(/^\/+|\/+$/g, "").replace(/.$/, "$&/"),
};

/** A list of problems. Empty means good to go. */
export function validateSettings(): string[] {
  const problems: string[] = [];
  if (!settings.lmApiBase) problems.push("CD_LM_API_BASE is not set");
  if (!settings.lmAccessToken) problems.push("CD_LM_ACCESS_TOKEN is not set — upstream will 403");
  if (!settings.clientId) problems.push("CD_CLIENT_ID is not set");
  if (!settings.fleetId) problems.push("CD_FLEET_ID is not set");
  if (!settings.openaiApiKey) {
    problems.push(
      "CD_OPENAI_API_KEY is not set — chart generation, naming and date-range fallback will all fail",
    );
  }
  return problems;
}
