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
  DataPacket_Kind,
  RoomServiceClient,
} from 'livekit-server-sdk';

import { LiveKitEgressService } from './livekit-egress.service';

export interface BrowserTestLiveKitSessionDto {
  callId: string;
  roomName: string;
  participantToken: string;
  participantIdentity: string;
  /** WebRTC signaling endpoint for the browser (typically `wss://…`). */
  serverUrl: string;
  recordingObjectKey: string | null;
}

@Injectable()
export class LiveKitBrowserTestService {
  private readonly logger = new Logger(LiveKitBrowserTestService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly egress: LiveKitEgressService,
  ) {}

  async issueBrowserParticipantSession(params: {
    callId: string;
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
    let recording = this.egress.createBrowserRecordingEgress({
      roomName,
      agentId: params.agentId,
      organizationId: params.organizationId,
    });
    let roomMetadata = this.browserRoomMetadata({
      callId: params.callId,
      agentId: params.agentId,
      organizationId: params.organizationId,
      roomName,
      recordingObjectKey: recording?.objectKey ?? null,
    });

    try {
      await rooms.createRoom({
        name: roomName,
        metadata: roomMetadata,
        emptyTimeout: 300,
        maxParticipants: 4,
        ...(recording ? { egress: recording.egress } : {}),
      });
    } catch (error: unknown) {
      if (!recording) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Browser test recording egress could not be attached for ${roomName}; retrying without recording: ${message}`,
      );
      recording = null;
      roomMetadata = this.browserRoomMetadata({
        callId: params.callId,
        agentId: params.agentId,
        organizationId: params.organizationId,
        roomName,
        recordingObjectKey: null,
      });
      await rooms.createRoom({
        name: roomName,
        metadata: roomMetadata,
        emptyTimeout: 300,
        maxParticipants: 4,
      });
    }

    try {
      await dispatchClient.createDispatch(roomName, agentWorkerName, {
        metadata: JSON.stringify({
          source: 'awaaz_browser_test_call',
          callId: params.callId,
          agentId: params.agentId,
          organizationId: params.organizationId,
          liveKitRoomName: roomName,
          ...(recording?.objectKey
            ? {
                recordingProvider: 'livekit-egress',
                recordingObjectKey: recording.objectKey,
              }
            : {}),
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
      callId: params.callId,
      roomName,
      participantIdentity,
      participantToken,
      serverUrl: serverWsUrl,
      recordingObjectKey: recording?.objectKey ?? null,
    };
  }

  private browserRoomMetadata(input: {
    callId: string;
    agentId: string;
    organizationId: string;
    roomName: string;
    recordingObjectKey: string | null;
  }): string {
    return JSON.stringify({
      source: 'awaaz_browser_test_call',
      callId: input.callId,
      agentId: input.agentId,
      organizationId: input.organizationId,
      liveKitRoomName: input.roomName,
      direction: 'INBOUND',
      fromNumber: 'browser-preview',
      toNumber: '',
      isTest: true,
      isTestCall: true,
      ...(input.recordingObjectKey
        ? {
            recordingProvider: 'livekit-egress',
            recordingObjectKey: input.recordingObjectKey,
          }
        : {}),
    });
  }

  async requestBrowserCallEnd(input: {
    roomName: string;
    callId: string;
    reason: string;
  }): Promise<void> {
    const roomName = input.roomName.trim();
    if (!roomName) {
      return;
    }

    const payload = Buffer.from(
      JSON.stringify({
        type: 'end_call',
        source: 'awaaz_api',
        callId: input.callId,
        reason: input.reason,
        requestedAt: new Date().toISOString(),
      }),
      'utf8',
    );
    const rooms = this.roomClient();
    await this.markRoomEndRequested(rooms, {
      roomName,
      callId: input.callId,
      reason: input.reason,
    });
    await rooms.sendData(
      roomName,
      payload,
      DataPacket_Kind.RELIABLE,
      { topic: 'awaaz.call.control' },
    );
    this.logger.log(
      `call_end_authoritative call_id=${input.callId} room=${roomName} reason=${input.reason}`,
    );
  }

  async closeBrowserRoom(input: {
    roomName: string;
    callId?: string;
    reason: string;
  }): Promise<void> {
    const roomName = input.roomName.trim();
    if (!roomName) {
      return;
    }

    try {
      await this.roomClient().deleteRoom(roomName);
      this.logger.log(
        `call_end_room_closed call_id=${input.callId ?? '(unknown)'} room=${roomName} reason=${input.reason}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `call_end_room_close_failed call_id=${input.callId ?? '(unknown)'} room=${roomName}: ${message}`,
      );
    }
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

  private roomClient(): RoomServiceClient {
    const serverWsUrl = this.normalizeSignalingWsUrl(
      this.mustGetEnv('LIVEKIT_URL').trim(),
    );
    return new RoomServiceClient(
      this.httpsTwirpBaseFromWsUrl(serverWsUrl),
      this.mustGetEnv('LIVEKIT_API_KEY'),
      this.mustGetEnv('LIVEKIT_API_SECRET'),
    );
  }

  private async markRoomEndRequested(
    rooms: RoomServiceClient,
    input: { roomName: string; callId: string; reason: string },
  ): Promise<void> {
    try {
      const [room] = await rooms.listRooms([input.roomName]);
      const metadata = this.parseRoomMetadata(room?.metadata);
      await rooms.updateRoomMetadata(
        input.roomName,
        JSON.stringify({
          ...metadata,
          endRequestedAt: new Date().toISOString(),
          endRequestedReason: input.reason,
          endRequestedBy: 'api',
          callId: input.callId,
        }),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `call_end_room_metadata_update_failed call_id=${input.callId} room=${input.roomName}: ${message}`,
      );
    }
  }

  private parseRoomMetadata(raw: string | undefined): Record<string, unknown> {
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private mustGetEnv(key: string): string {
    const found = this.readTrimmedOptional(key);
    if (!found) {
      throw new ServiceUnavailableException(`Missing configuration: ${key}`);
    }
    return found;
  }
}
