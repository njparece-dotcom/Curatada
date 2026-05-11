// Cloudflare R2 storage adapter.
//
// R2 speaks the S3 API, so we use `@aws-sdk/client-s3` against R2's endpoint
// (`https://<account_id>.r2.cloudflarestorage.com`). Bucket is private; reads
// happen through short-lived presigned URLs generated server-side, so an
// expired URL stops working and image hotlinking has a natural TTL.
//
// Singleton on globalThis (same pattern as the pg Pool) so a per-request
// allocation doesn't leak HTTP connections under burst load.
//
// When R2_* env vars are absent, `r2IsConfigured()` returns false and
// callers fall back to local-disk storage. That keeps `npm run dev` working
// against a docker-compose Postgres without forcing every contributor to
// provision an R2 bucket.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

declare global {
  // eslint-disable-next-line no-var
  var _r2Client: S3Client | undefined;
}

const PRESIGNED_TTL_SEC = 60 * 60; // 1 hour

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * Returns true when all four R2_* env vars are present. Callers should
 * branch on this so the local-dev path (write to public/uploads) keeps
 * working when credentials aren't configured.
 */
export function r2IsConfigured(): boolean {
  return readConfig() !== null;
}

function getClient(): { client: S3Client; bucket: string } {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "R2 storage env vars are not set: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.",
    );
  }
  if (!globalThis._r2Client) {
    globalThis._r2Client = new S3Client({
      // R2 is region-less; the SDK still wants something. `auto` is the
      // documented value for R2.
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client: globalThis._r2Client, bucket: config.bucket };
}

export async function r2PutObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Generates a presigned GET URL valid for ~1 hour. The /api/uploads/[...path]
 * route redirects to this so the browser only ever sees a freshly minted
 * URL when it asks the app for it.
 */
export async function r2GetPresignedUrl(key: string): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGNED_TTL_SEC },
  );
}

export async function r2DeleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { client, bucket } = getClient();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}

export const R2_PRESIGN_TTL_SECONDS = PRESIGNED_TTL_SEC;
