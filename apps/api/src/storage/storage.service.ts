import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
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
  ): Promise<string> {
    const r2 = this.getR2Config();
    const client = this.createClient(r2);

    await client.send(
      new PutObjectCommand({
        Bucket: r2.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = 300,
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
      }),
      { expiresIn },
    );
  }

  private createClient(r2: R2Config): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
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
}
