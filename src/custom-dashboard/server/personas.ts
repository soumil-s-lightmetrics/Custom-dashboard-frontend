/**
 * Persona catalog. Port of backend/personas.py.
 *
 * The domain hints are grounded in the parent's datasources/*_source.py
 * descriptions. They are ADVISORY ONLY — talk-to-data classifies server-side —
 * and exist to steer suggestion wording and order the right rail.
 */

export interface Persona {
  id: string;
  title: string;
  description: string;
  icon: string;
  domains: string[];
  seeds: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "fleet_manager",
    title: "Fleet Manager",
    description: "Oversee vehicle performance, routes and utilisation",
    icon: "users",
    domains: ["trip", "asset", "cross_domain"],
    seeds: [
      "Show me assets with the most trips this week",
      "Top 10 vehicles by distance last 30 days",
      "Show me a list of all assets and their duty types",
      "Which vehicles had the most events last 7 days",
      "Show trip counts by day over the last 30 days",
      "List assets with no trips in the past 14 days",
    ],
  },
  {
    id: "safety_coach",
    title: "Safety Coach",
    description: "Monitor driver behaviour and safety incidents",
    icon: "whistle",
    domains: ["coaching", "trip", "driver"],
    seeds: [
      "Show me drivers with the most trips this week",
      "Top 5 incidents last 30 days",
      "Show me a list of drivers for drowsiness only",
      "Which drivers are eligible for coaching this month",
      "Show harsh braking events by day over the last 14 days",
      "Top 10 drivers by speeding violations last 30 days",
    ],
  },
  {
    id: "operations_manager",
    title: "Operations Manager",
    description: "Track efficiency, scheduling and KPIs",
    icon: "clipboard",
    domains: ["trip", "driver", "cross_domain"],
    seeds: [
      "Show trip duration totals by day this month",
      "Top 10 drivers by number of trips last 30 days",
      "Show me a list of active drivers and their status",
      "Which days had the most trips in the last 30 days",
      "Show event counts by severity last 7 days",
      "List drivers with no trips in the past 14 days",
    ],
  },
  {
    id: "installer",
    title: "Installer",
    description: "View installation status and diagnostics",
    icon: "settings",
    domains: ["diagnostics", "asset"],
    seeds: [
      "Show me devices with camera mounting issues last 30 days",
      "Top 10 devices by health events in the last 7 days",
      "Show me a list of devices and their firmware versions",
      "Which devices went offline in the last 7 days",
      "Show device health events by day over the last 14 days",
      "List assets with no device assigned",
    ],
  },
];

/** Used when the user skips persona selection. */
export const GENERALIST: Persona = {
  id: "generalist",
  title: "Everything",
  description: "A mix across trips, drivers, assets and devices",
  icon: "grid",
  domains: ["trip", "diagnostics"],
  seeds: [
    "Show me drivers with the most trips this week",
    "Top 5 incidents last 30 days",
    "Show me a list of drivers for drowsiness only",
    "Show event counts by day over the last 14 days",
    "Which devices had health issues in the last 7 days",
    "Top 10 assets by events last 30 days",
  ],
};

/** Verbatim from the parent's datasources, so prompts only propose answerable questions. */
export const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  trip:
    "Vehicle trip data: driving events, violations (harsh braking, speed, " +
    "lane drift, drowsy driving, etc.), trip distance/duration, driver " +
    "behavior, and event severity metrics.",
  diagnostics:
    "Device health and diagnostics: device status, firmware/APK versions, " +
    "camera mounting issues, SD card failures, GPS anomalies, network " +
    "issues, connectivity (ping/heartbeat), data usage, and raw health " +
    "event history.",
  asset:
    "Vehicle and device asset provisioning data: asset/vehicle list, device " +
    "assignments, camera types, duty types, default drivers, pilot status, " +
    "RideCam Plus plans, packages, and asset tags.",
  coaching:
    "Coaching workflow data: coaching sessions (self-coaching, in-person, " +
    "in-person escalation), coach assignments, coachable-driver and " +
    "top-driver leaderboards, coaching session events, session notes, and " +
    "fleet coaching configuration. Session status values: PENDING, " +
    "COACHED, EXPIRED.",
  driver:
    "Driver ROSTER and per-driver attribute lookups: driver source, " +
    "companion-app login status. Use only for a driver list or a " +
    "driver-attribute lookup with no driving-behavior or ranking context.",
  cross_domain: "Questions that need data joined across two of the above.",
};

const BY_ID = new Map<string, Persona>([...PERSONAS, GENERALIST].map((p) => [p.id, p]));

/** Unknown or null (the Skip path) resolves to the generalist. */
export function getPersona(id: string | null | undefined): Persona {
  return BY_ID.get(id || "") ?? GENERALIST;
}

export function publicPersona(p: Persona) {
  const { seeds: _seeds, ...rest } = p;
  return rest;
}

/** The four cards shown on the persona screen — generalist is not one. */
export function catalog() {
  return PERSONAS.map(publicPersona);
}
