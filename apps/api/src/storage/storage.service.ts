import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface R2S3UploadConfig extends R2Config {
  endpoint: string;
  region: string;
}

@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.getR2ConfigOrNull() !== null;
  }

  async uploadBuffer(
    key: string,
    body: Uint8Array,
    contentType: string,
    options?: { cacheControl?: string },
  ): Promise<string> {
    const r2 = this.getR2Config();
    const client = this.createClient(r2);

    await client.send(
      new PutObjectCommand({
        Bucket: r2.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(options?.cacheControl ? { CacheControl: options.cacheControl } : {}),
      }),
    );
    return key;
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = 300,
    responseContentType?: string,
  ): Promise<string> {
    const r2 = this.getR2Config();
    const expiresIn = Math.min(
      Math.max(Math.floor(expiresInSeconds), 1),
      3_600,
    );

    return getSignedUrl(
      this.createClient(r2),
      new GetObjectCommand({
        Bucket: r2.bucketName,
        Key: key,
        ...(responseContentType
          ? { ResponseContentType: responseContentType }
          : {}),
      }),
      { expiresIn },
    );
  }

  async objectExists(key: string): Promise<boolean> {
    const r2 = this.getR2Config();
    try {
      await this.createClient(r2).send(
        new HeadObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  getPublicUrl(key: string): string | null {
    const baseUrl =
      this.config.get<string>('PUBLIC_ASSET_BASE_URL') ??
      this.config.get<string>('CLOUDFLARE_R2_PUBLIC_BASE_URL');
    const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, '');
    if (!normalizedBaseUrl) {
      return null;
    }

    const objectKey = this.normalizeObjectKey(key);
    return objectKey
      ? `${normalizedBaseUrl}/${encodeObjectKey(objectKey)}`
      : null;
  }

  getS3UploadConfig(): R2S3UploadConfig {
    const r2 = this.getR2Config();
    return {
      ...r2,
      endpoint: this.endpointForAccount(r2.accountId),
      region: 'auto',
    };
  }

  normalizeObjectKey(value: string | undefined | null): string | null {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }
    const bucketName = this.getR2ConfigOrNull()?.bucketName ?? '';
    return normalizeR2ObjectKey(raw, bucketName);
  }

  private createClient(r2: R2Config): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: this.endpointForAccount(r2.accountId),
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
      },
    });
  }

  private getR2Config(): R2Config {
    const config = this.getR2ConfigOrNull();
    if (!config) {
      throw new ServiceUnavailableException('Cloudflare R2 is not configured');
    }
    return config;
  }

  private getR2ConfigOrNull(): R2Config | null {
    const accountId =
      this.config.get<string>('CLOUDFLARE_R2_ACCOUNT_ID') ??
      this.config.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const accessKeyId =
      this.config.get<string>('CLOUDFLARE_R2_ACCESS_KEY') ??
      this.config.get<string>('R2_ACCESS_KEY');
    const secretAccessKey =
      this.config.get<string>('CLOUDFLARE_R2_SECRET_KEY') ??
      this.config.get<string>('R2_SECRET_KEY');
    const bucketName =
      this.config.get<string>('CLOUDFLARE_R2_BUCKET_NAME') ??
      this.config.get<string>('R2_BUCKET_NAME');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return null;
    }

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
    };
  }

  private endpointForAccount(accountId: string): string {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  private isNotFoundError(error: unknown): boolean {
    const err = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    } | null;
    return (
      err?.$metadata?.httpStatusCode === 404 ||
      err?.name === 'NotFound' ||
      err?.name === 'NoSuchKey'
    );
  }
}

function normalizeR2ObjectKey(raw: string, bucketName: string): string | null {
  const withoutQuery = raw.split('?')[0]?.trim() ?? '';
  if (!withoutQuery) {
    return null;
  }

  if (bucketName && withoutQuery.startsWith(`s3://${bucketName}/`)) {
    return cleanObjectKey(withoutQuery.slice(`s3://${bucketName}/`.length), bucketName);
  }
  if (withoutQuery.startsWith('s3://')) {
    const withoutScheme = withoutQuery.slice('s3://'.length);
    const slash = withoutScheme.indexOf('/');
    return slash >= 0
      ? cleanObjectKey(withoutScheme.slice(slash + 1), bucketName)
      : null;
  }

  try {
    const url = new URL(raw);
    return cleanObjectKey(url.pathname.replace(/^\/+/, ''), bucketName);
  } catch {
    return cleanObjectKey(withoutQuery.replace(/^\/+/, ''), bucketName);
  }
}

function cleanObjectKey(value: string, bucketName: string): string | null {
  let key = decodePath(value).replace(/^\/+/, '');
  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }
  return key.trim() || null;
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeObjectKey(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}
