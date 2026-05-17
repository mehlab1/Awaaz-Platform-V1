import { randomUUID } from 'crypto';

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
} from 'livekit-server-sdk';

export interface BrowserTestLiveKitSessionDto {
  roomName: string;
  participantToken: string;
  participantIdentity: string;
  /** WebRTC signaling endpoint for the browser (typically `wss://…`). */
  serverUrl: string;
}

@Injectable()
export class LiveKitBrowserTestService {
  private readonly logger = new Logger(LiveKitBrowserTestService.name);

  constructor(private readonly config: ConfigService) {}

  async issueBrowserParticipantSession(params: {
    agentId: string;
    organizationId: string;
  }): Promise<BrowserTestLiveKitSessionDto> {
    const rawUrl = this.mustGetEnv('LIVEKIT_URL').trim();
    const serverWsUrl = this.normalizeSignalingWsUrl(rawUrl);

    const apiKey = this.mustGetEnv('LIVEKIT_API_KEY');
    const apiSecret = this.mustGetEnv('LIVEKIT_API_SECRET');
    const httpHost = this.httpsTwirpBaseFromWsUrl(serverWsUrl);

    const rooms = new RoomServiceClient(httpHost, apiKey, apiSecret);
    const dispatchClient = new AgentDispatchClient(httpHost, apiKey, apiSecret);
    const agentWorkerName =
      this.readTrimmedOptional('LIVEKIT_AGENT_NAME') ?? 'awaaz-agent';

    const suffix = randomUUID();
    const roomName = `test-${params.organizationId.slice(0, 8)}-${params.agentId.slice(0, 8)}-${suffix}`.slice(
      0,
      96,
    );
    const participantIdentity = `browser-test-${suffix}`;
    const roomMetadata = JSON.stringify({
      agentId: params.agentId,
      organizationId: params.organizationId,
      direction: 'INBOUND',
      fromNumber: 'browser-preview',
      toNumber: '',
      isTest: true,
      isTestCall: true,
    });

    await rooms.createRoom({
      name: roomName,
      metadata: roomMetadata,
      emptyTimeout: 300,
      maxParticipants: 4,
    });

    try {
      await dispatchClient.createDispatch(roomName, agentWorkerName, {
        metadata: JSON.stringify({
          source: 'awaaz_browser_test_call',
          agentId: params.agentId,
          organizationId: params.organizationId,
        }),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Explicit agent dispatch failed for ${roomName}; deleting room.`,
        error instanceof Error ? error.message : undefined,
      );
      try {
        await rooms.deleteRoom(roomName);
      } catch {
        /* ignore cleanup failure */
      }
      throw error;
    }

    const tokenSigner = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      ttl: '12m',
      name: 'Browser test caller',
    });
    tokenSigner.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
    });
    const participantToken = await tokenSigner.toJwt();

    return {
      roomName,
      participantIdentity,
      participantToken,
      serverUrl: serverWsUrl,
    };
  }

  isConfigured(): boolean {
    try {
      this.mustGetEnv('LIVEKIT_URL');
      this.mustGetEnv('LIVEKIT_API_KEY');
      this.mustGetEnv('LIVEKIT_API_SECRET');
      return true;
    } catch {
      return false;
    }
  }

  private normalizeSignalingWsUrl(raw: string): string {
    if (
      raw.startsWith('wss://') ||
      raw.startsWith('ws://')
    ) {
      return raw;
    }
    if (raw.startsWith('https://') || raw.startsWith('http://')) {
      const u = new URL(raw);
      return u.protocol === 'https:'
        ? `wss://${u.host}`
        : `ws://${u.host}`;
    }
    throw new ServiceUnavailableException(
      'LIVEKIT_URL must be a ws(s):// or http(s):// URL (examples: wss://… .livekit.cloud)',
    );
  }

  /** LiveKit REST / Twirp expects https hostname (matching cloud projects). */
  private httpsTwirpBaseFromWsUrl(wsLike: string): string {
    try {
      if (wsLike.startsWith('wss://')) {
        return `https://${new URL(wsLike).host}`;
      }
      if (wsLike.startsWith('ws://')) {
        return `http://${new URL(wsLike).host}`;
      }
    } catch {
      /* fall through */
    }
    throw new ServiceUnavailableException(
      `Could not derive Twirp base URL from LIVEKIT_URL`,
    );
  }

  private readTrimmedOptional(key: string): string | undefined {
    const v = this.config.get<string>(key);
    const t = v?.trim();
    return t && t.length > 0 ? t : undefined;
  }

  private mustGetEnv(key: string): string {
    const found = this.readTrimmedOptional(key);
    if (!found) {
      throw new ServiceUnavailableException(`Missing configuration: ${key}`);
    }
    return found;
  }
}
