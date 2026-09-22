/**
 * Structured one-line JSON logs on stdout. On Amplify, SSR stdout lands in
 * CloudWatch (Amplify console -> Monitoring -> Hosting compute logs), where
 * each line can be filtered by field, e.g. { $.kind = "access" && $.status >= 500 }.
 */

type Fields = Record<string, unknown>;

export function log(kind: "access" | "flow" | "error", fields: Fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...fields });
  if (kind === "error" || (typeof fields.status === "number" && fields.status >= 500)) console.error(line);
  else console.log(line);
}
