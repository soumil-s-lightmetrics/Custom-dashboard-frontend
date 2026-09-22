# Custom Dashboard

Build fleet dashboards by asking questions in plain language: ask, get an
answer with a chart, pin it to a widget. A Next.js app that talks to the
LightMetrics API for data and to OpenAI for chart generation and naming.

**There is no login.** Anyone with the URL can use it and see the configured
account's fleet data. See "Restricting access" below.

## Layout

```
src/app/                       routes
  page.tsx                     /            -> redirects to /custom-dashboard
  custom-dashboard/            the pages (persona -> picker -> builder)
  api/custom-dashboard/        20 route handlers the UI calls
src/custom-dashboard/
  server/                      LightMetrics + OpenAI calls, storage, catalog
  ui/                          React app (screens, chat, widget grid, stores)
  styles.css
```

URLs are unchanged from when this lived inside LM labs, so `/custom-dashboard`
is the app's home and `/` just forwards there.

## Local development

```bash
cp .env.local.example .env.local   # fill in the required values
npm install
npm run dev                        # http://localhost:3000
```

With the S3 settings left empty, data is written as JSON files under `.data/`.

## Storage

Everything the app saves (dashboards, saved reports, chat history, cached
query results) goes through `src/custom-dashboard/server/storage.ts`:

- **Local files** when `CD_S3_BUCKET` is unset — development only.
- **S3** when it is set — required on Amplify. Concurrent writers are handled
  with conditional writes (If-Match) and retries, so simultaneous edits never
  overwrite each other.

## Deploying on AWS Amplify

1. Create an S3 bucket for the app's data.
2. Amplify console -> **New app -> Host web app -> GitHub** -> pick this repo
   and branch. `amplify.yml` is picked up automatically.
3. Add the environment variables listed at the top of `amplify.yml`.
4. Give the app a **compute role** (App settings -> IAM roles) allowing
   `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on
   `arn:aws:s3:::<bucket>/custom-dashboard/*` and `s3:ListBucket` on
   `arn:aws:s3:::<bucket>`. Without `ListBucket`, S3 answers "access denied"
   instead of "not found" for objects that don't exist yet and the first load
   fails.
5. Deploy, then open `/api/custom-dashboard/health` — it lists any missing
   settings and which storage backend is active.

## Restricting access

The app has no login of its own. To keep it off the open internet, use
Amplify's built-in access control (App settings -> Access control) to set a
username and password for the branch.

## Things to know

- **One account for everyone.** `CD_CLIENT_ID` and `CD_FLEET_ID` are single
  fixed values, so every visitor sees that account's data.
- **Dashboards are shared.** Nothing is per-user: everyone sees, edits and can
  delete the same dashboards, saved reports and chat history.
- **The access token expires.** `CD_LM_ACCESS_TOKEN` is one fixed token; when
  it expires the app stops working until it is replaced. Use a long-lived
  service token.
- **30-second limit.** Amplify cuts off responses at 30s, while the code allows
  the LightMetrics call alone up to `CD_UPSTREAM_READ_TIMEOUT` (default 180s).
  Slow questions will fail in production even though they work locally.
