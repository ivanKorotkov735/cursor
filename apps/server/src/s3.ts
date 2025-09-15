import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

const S3_ENABLED = process.env.S3_ENABLED === 'true';

let s3: S3Client | null = null;

export function getS3Client(): S3Client | null {
  if (!S3_ENABLED) return null;
  if (s3) return s3;
  s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || !!process.env.S3_ENDPOINT,
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  return s3;
}

export async function uploadToS3(key: string, body: Buffer | Uint8Array | Blob | string | Readable, contentType: string): Promise<void> {
  const client = getS3Client();
  if (!client) return;
  const bucket = process.env.S3_BUCKET as string;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getFileSignedUrl(key: string, expiresSeconds = 300): Promise<string | null> {
  const client = getS3Client();
  if (!client) return null;
  const bucket = process.env.S3_BUCKET as string;
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key });
  // For GET we technically should use GetObjectCommand, but keep types minimal here
  // To avoid extra import, generate manually with getSignedUrl for GetObject
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(client, getCmd as any, { expiresIn: expiresSeconds });
  return url;
}

export function isS3Enabled(): boolean {
  return S3_ENABLED && !!process.env.S3_BUCKET;
}

