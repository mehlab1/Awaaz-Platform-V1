import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  EncodedFileOutput,
  EncodedFileType,
  type EgressInfo,
  RoomCompositeEgressRequest,
  RoomEgress,
  S3Upload,
} from 'livekit-server-sdk';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

interface BrowserRecordingInput {
  roomName: string;
  organizationId: string;
  agentId: string;
}

export interface BrowserRecordingEgress {
  egress: RoomEgress;
  objectKey: string;
}

@Injectable()
export class LiveKitEgressService {
  private readonly logger = new Logger(LiveKitEgressService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  createBrowserRecordingEgress(
    input: BrowserRecordingInput,
  ): BrowserRecordingEgress | null {
    if (this.browserRecordingDisabled()) {
      return null;
    }
    if (!this.storage.isConfigured()) {
      this.logger.warn(
        'Browser test recording skipped: Cloudflare R2 is not configured',
      );
      return null;
    }

    const s3 = this.storage.getS3UploadConfig();
    const objectKey = this.browserRecordingObjectKey(input);
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP3,
      filepath: objectKey,
      disableManifest: true,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: s3.accessKeyId,
          secret: s3.secretAccessKey,
          region: s3.region,
          endpoint: s3.endpoint,
          bucket: s3.bucketName,
          forcePathStyle: true,
          metadata: {
            source: 'awaaz_browser_test_call',
            organizationId: input.organizationId,
            agentId: input.agentId,
            roomName: input.roomName,
          },
        }),
      },
    });

    return {
      objectKey,
      egress: new RoomEgress({
        room: new RoomCompositeEgressRequest({
          roomName: input.roomName,
          audioOnly: true,
          fileOutputs: [output],
        }),
      }),
    };
  }

  async persistBrowserRecordingFromEgress(info: EgressInfo): Promise<boolean> {
    const roomIds = [info.roomId, info.roomName].filter(
      (value): value is string => Boolean(value?.trim()),
    );
    if (roomIds.length === 0) {
      this.logger.warn(
        `LiveKit egress ${info.egressId || '(unknown)'} ended without room identifiers`,
      );
      return false;
    }

    const call = await this.prisma.call.findFirst({
      where: { liveKitRoomId: { in: roomIds } },
      select: {
        id: true,
        fromNumber: true,
        metadata: true,
      },
    });
    if (!call) {
      this.logger.warn(
        `LiveKit egress ${info.egressId || '(unknown)'} ended for unknown room ${roomIds.join(', ')}`,
      );
      return false;
    }
    if (!this.isBrowserPreviewCall(call)) {
      return false;
    }

    const objectKey =
      this.extractObjectKey(info) ?? this.recordingObjectKeyFromMetadata(call.metadata);
    if (!objectKey) {
      this.logger.warn(
        `LiveKit egress ${info.egressId || '(unknown)'} ended without a file key`,
      );
      return false;
    }

    await this.prisma.call.update({
      where: { id: call.id },
      data: {
        recordingUrl: objectKey,
        metadata: this.withRecordingMetadata(call.metadata, info, objectKey),
      },
    });
    this.logger.log(
      `Saved browser test recording for call ${call.id}: ${objectKey}`,
    );
    return true;
  }

  private browserRecordingDisabled(): boolean {
    const value = this.config
      .get<string>('LIVEKIT_BROWSER_RECORDING_ENABLED')
      ?.trim()
      .toLowerCase();
    return value === '0' || value === 'false' || value === 'off';
  }

  private browserRecordingObjectKey(input: BrowserRecordingInput): string {
    return [
      'recordings',
      'browser-preview',
      this.safePathPart(input.organizationId),
      this.safePathPart(input.agentId),
      `${this.safePathPart(input.roomName)}.mp3`,
    ].join('/');
  }

  private safePathPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  }

  private extractObjectKey(info: EgressInfo): string | null {
    const file =
      this.firstFileResult(info) ??
      (info.result?.case === 'file' ? info.result.value : undefined);
    if (!file) {
      return null;
    }

    const fromFilename = this.normalizeObjectKey(file.filename);
    if (fromFilename) {
      return fromFilename;
    }
    return this.normalizeObjectKey(file.location);
  }

  private normalizeObjectKey(value: string | undefined): string | null {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }

    const bucketName = this.r2BucketName();
    if (raw.startsWith(`s3://${bucketName}/`)) {
      return raw.slice(`s3://${bucketName}/`.length);
    }
    if (raw.startsWith('s3://')) {
      const withoutScheme = raw.slice('s3://'.length);
      const slash = withoutScheme.indexOf('/');
      return slash >= 0 ? withoutScheme.slice(slash + 1) : null;
    }

    try {
      const url = new URL(raw);
      const path = url.pathname.replace(/^\/+/, '');
      if (path.startsWith(`${bucketName}/`)) {
        return path.slice(bucketName.length + 1);
      }
      return path || null;
    } catch {
      return raw.replace(/^\/+/, '') || null;
    }
  }

  private recordingObjectKeyFromMetadata(
    metadata: Prisma.JsonValue | null,
  ): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const record = metadata as Record<string, unknown>;

    const nested = record.recording;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      const objectKey = nestedRecord.objectKey;
      if (typeof objectKey === 'string' && objectKey.trim()) {
        return objectKey.trim();
      }
    }

    const topLevel = record.recordingObjectKey;
    if (typeof topLevel === 'string' && topLevel.trim()) {
      return topLevel.trim();
    }

    return null;
  }

  private r2BucketName(): string {
    try {
      return this.storage.getS3UploadConfig().bucketName;
    } catch {
      return '';
    }
  }

  private isBrowserPreviewCall(call: {
    fromNumber: string | null;
    metadata: Prisma.JsonValue | null;
  }): boolean {
    if (call.fromNumber === 'browser-preview') {
      return true;
    }
    if (
      !call.metadata ||
      typeof call.metadata !== 'object' ||
      Array.isArray(call.metadata)
    ) {
      return false;
    }
    const metadata = call.metadata as Record<string, unknown>;
    return (
      metadata.source === 'awaaz_browser_test_call' ||
      metadata.isTest === true ||
      metadata.isTestCall === true
    );
  }

  private withRecordingMetadata(
    metadata: Prisma.JsonValue | null,
    info: EgressInfo,
    objectKey: string,
  ): Prisma.InputJsonValue {
    const file = this.firstFileResult(info);
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};
    return {
      ...base,
      recording: {
        provider: 'livekit-egress',
        objectKey,
        egressId: info.egressId || null,
        roomId: info.roomId || null,
        roomName: info.roomName || null,
        size: file?.size !== undefined ? Number(file.size) : null,
        endedAt:
          info.endedAt && info.endedAt > 0n
            ? new Date(Number(info.endedAt / 1_000_000n)).toISOString()
            : null,
      },
    } as Prisma.InputJsonValue;
  }

  private firstFileResult(info: EgressInfo): EgressInfo['fileResults'][number] | null {
    return info.fileResults?.[0] ?? null;
  }
}
