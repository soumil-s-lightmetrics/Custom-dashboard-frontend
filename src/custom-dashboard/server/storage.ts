/**
 * JSON document store. Port of backend/store.py.
 *
 * Two backends behind one interface (read / mutate / getBlob / putBlob /
 * deleteBlob); nothing else in src/server knows which one is active.
 *
 * - Local files (default): data/<name>.json, in exactly the format the Flask
 *   backend wrote, so the two are interchangeable. Writes go to a temp file
 *   and are renamed into place, so a crash mid-write never leaves a
 *   half-written document behind. Only sound while the app runs as ONE Node
 *   process (`next dev` / `next start`).
 *
 * - S3 (when CD_S3_BUCKET is set): s3://<bucket>/<prefix><name>.json. Needed
 *   on Amplify, which runs several short-lived server instances with no
 *   shared disk. mutate() is optimistic: read the object with its ETag, apply
 *   the change, write back only if the ETag still matches (If-Match), and on
 *   a conflict re-read and try again. So a mutate callback may run more than
 *   once and must only change the document it is given.
 *
 *   The server's IAM role needs s3:GetObject, s3:PutObject and
 *   s3:DeleteObject on the prefix, plus s3:ListBucket on the bucket. Without
 *   ListBucket, S3 answers a missing object with 403 instead of 404, and
 *   every first read of a new document fails.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { settings } from "./config";
import { clone, hex } from "./util";

const USE_S3 = Boolean(settings.s3Bucket);

// Serialises mutations of one document within this process. On local files
// that is the whole guarantee; on S3 it just avoids needless ETag conflicts
// between requests handled by the same instance.
// On globalThis so that route bundles that each import this module in dev
// still share one lock per document.
const g = globalThis as unknown as { __cdLocks?: Map<string, Promise<unknown>> };
const locks = (g.__cdLocks ??= new Map());

function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(name) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    name,
    next.catch(() => undefined),
  );
  return next;
}

// Keys are fixed document names or server-generated ids; refuse anything
// that could step outside the data directory / prefix.
function checkKey(key: string): string {
  if (!/^[a-z0-9_]+(\/[a-z0-9_]+)*$/i.test(key)) {
    throw new Error(`invalid storage key: ${key}`);
  }
  return key;
}

/* ------------------------------------------------------------ local files */

// Runtime data, not source: keep the bundler from tracing the whole project.
const root = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), settings.dataDir);
const fileFor = (key: string) => path.join(root(), `${checkKey(key)}.json`);

async function localRead<T>(key: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    console.error(`[storage] could not read ${key} (${(err as Error).message}) — using default`);
    return undefined;
  }
}

async function localWrite(key: string, payload: unknown): Promise<void> {
  const target = fileFor(key);
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(key)}.${hex(8)}.tmp`);
  try {
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

async function localDelete(key: string): Promise<void> {
  await fs.unlink(fileFor(key)).catch(() => undefined);
}

/* --------------------------------------------------------------------- S3 */

let client: S3Client | null = null;
const s3 = () => (client ??= new S3Client(settings.s3Region ? { region: settings.s3Region } : {}));
const objectKey = (key: string) => `${settings.s3Prefix}${checkKey(key)}.json`;

const MAX_ATTEMPTS = 5;

function httpStatus(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

// 412: the ETag moved (someone else wrote first). 409: S3 was mid-way through
// another conditional write to the same key.
const isConflict = (err: unknown) => {
  const status = httpStatus(err);
  return status === 412 || status === 409;
};

/** The document and its ETag. Missing -> doc undefined, no ETag. */
async function s3Load<T>(key: string): Promise<{ doc: T | undefined; etag?: string }> {
  let text: string;
  let etag: string | undefined;
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: settings.s3Bucket, Key: objectKey(key) }));
    text = (await res.Body?.transformToString()) ?? "";
    etag = res.ETag;
  } catch (err) {
    if (httpStatus(err) === 404 || (err as Error)?.name === "NoSuchKey") return { doc: undefined };
    // Unlike a missing file, an S3 read failure (permissions, network) is not
    // "no data yet". Surface it; answering with an empty default would show
    // users an empty dashboard list.
    throw err;
  }
  try {
    return { doc: JSON.parse(text) as T, etag };
  } catch (err) {
    console.error(`[storage] could not parse ${key} (${(err as Error).message}) — using default`);
    return { doc: undefined, etag };
  }
}

async function s3Write(
  key: string,
  payload: unknown,
  condition: { IfMatch?: string; IfNoneMatch?: string } = {},
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: settings.s3Bucket,
      Key: objectKey(key),
      Body: JSON.stringify(payload, null, 2),
      ContentType: "application/json",
      ...condition,
    }),
  );
}

async function s3Mutate<T>(name: string, fallback: T, fn: (doc: T) => T | void): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { doc: stored, etag } = await s3Load<T>(name);
    let doc = stored ?? clone(fallback);
    const result = fn(doc); // may throw (e.g. notFound); that is not retried
    if (result !== undefined) doc = result;
    try {
      // Existing object: only overwrite the version we read. New object:
      // only create it if nobody else just did.
      await s3Write(name, doc, etag ? { IfMatch: etag } : { IfNoneMatch: "*" });
      return doc;
    } catch (err) {
      if (!isConflict(err) || attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 25 * attempt + Math.random() * 50));
    }
  }
}

/* ------------------------------------------------------------- interface */

/** The document, or a copy of `fallback` if it does not exist yet. */
export async function read<T>(name: string, fallback: T): Promise<T> {
  const doc = USE_S3 ? (await s3Load<T>(name)).doc : await localRead<T>(name);
  return doc ?? clone(fallback);
}

/**
 * Read, apply fn, write back — holding the document's lock throughout.
 * fn may mutate the document in place and/or return a replacement. On S3 it
 * can run more than once (see the file header), so it must only touch `doc`.
 */
export function mutate<T>(name: string, fallback: T, fn: (doc: T) => T | void): Promise<T> {
  return withLock(name, async () => {
    if (USE_S3) return s3Mutate(name, fallback, fn);
    let doc = (await localRead<T>(name)) ?? clone(fallback);
    const result = fn(doc);
    if (result !== undefined) doc = result;
    await localWrite(name, doc);
    return doc;
  });
}

/** Single-object blobs (e.g. the query-result cache) under a key prefix. */
export async function getBlob<T>(key: string): Promise<T | null> {
  const doc = USE_S3 ? (await s3Load<T>(key)).doc : await localRead<T>(key);
  return doc ?? null;
}

export async function putBlob(key: string, value: unknown): Promise<void> {
  if (USE_S3) await s3Write(key, value);
  else await localWrite(key, value);
}

export async function deleteBlob(key: string): Promise<void> {
  if (!USE_S3) return localDelete(key);
  await s3()
    .send(new DeleteObjectCommand({ Bucket: settings.s3Bucket, Key: objectKey(key) }))
    .catch((err) => console.error(`[storage] could not delete ${key}: ${(err as Error).message}`));
}

export function describe() {
  return USE_S3
    ? { backend: "s3", location: `s3://${settings.s3Bucket}/${settings.s3Prefix}` }
    : { backend: "local", location: root() };
}
