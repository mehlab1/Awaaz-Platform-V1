import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  Prisma,
  ProviderCredentialMode,
  ProviderCredentialStatus,
  type OrganizationProviderCredential,
} from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertProviderCredentialDto } from './dto/upsert-provider-credential.dto';
import {
  PROVIDER_CATALOG,
  providerById,
  type ProviderDefinition,
} from './provider-catalog';

const KEY_PREFIX_LENGTH = 8;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_AUTH_TAG_BYTES = 16;
const VALIDATION_TIMEOUT_MS = 10_000;
const CARTESIA_API_VERSION = '2026-03-01';

type SanitizedCredential = {
  id: string;
  providerId: string;
  kind: string;
  label: string;
  credentialMode: ProviderCredentialMode;
  status: ProviderCredentialStatus;
  keyPrefix: string | null;
  hasSecret: boolean;
  finovaManagedAvailable: boolean;
  validationError: string | null;
  lastValidatedAt: Date | null;
  lastUsedAt: Date | null;
  markupBps: number;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderAvailability = {
  id: string;
  kind: string;
  label: string;
  defaultModel?: string;
  supportsByok: true;
  supportsFinovaManaged: true;
  finovaManagedAvailable: boolean;
  organizationCredential: SanitizedCredential | null;
  available: boolean;
  availableVia: ProviderCredentialMode | null;
};

type ResolvedSecret =
  | {
      ok: true;
      key: string;
      credentialMode: ProviderCredentialMode;
    }
  | {
      ok: false;
      credentialMode: ProviderCredentialMode;
      error: string;
    };

type ProviderCredentialMutationData = {
  credentialMode: ProviderCredentialMode;
  status: ProviderCredentialStatus;
  keyPrefix?: string | null;
  keyFingerprint?: string | null;
  secretCiphertext?: string | null;
  secretIv?: string | null;
  secretAuthTag?: string | null;
  validationError?: string | null;
  markupBps: number;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class PluginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async catalog(organizationId: string) {
    const credentials = await this.credentialsByProvider(organizationId);
    const providers = PROVIDER_CATALOG.map((provider) =>
      this.availability(provider, credentials.get(provider.id) ?? null),
    );
    return { providers };
  }

  async listCredentials(organizationId: string): Promise<SanitizedCredential[]> {
    const rows = await this.prisma.organizationProviderCredential.findMany({
      where: { organizationId },
      orderBy: [{ providerId: 'asc' }],
    });
    return rows.map((row) => this.sanitize(row));
  }

  async upsertCredential(
    organizationId: string,
    actorUserId: string,
    providerId: string,
    dto: UpsertProviderCredentialDto,
  ): Promise<SanitizedCredential> {
    const provider = this.mustProvider(providerId);
    const existing =
      await this.prisma.organizationProviderCredential.findUnique({
        where: {
          organizationId_providerId: {
            organizationId,
            providerId: provider.id,
          },
        },
      });

    const data = this.credentialData(provider, dto, existing);
    const credential = await this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.organizationProviderCredential.update({
            where: { id: existing.id },
            data,
          })
        : await tx.organizationProviderCredential.create({
            data: {
              organizationId,
              providerId: provider.id,
              ...data,
            },
          });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: existing ? AuditAction.UPDATED : AuditAction.CREATED,
          entityType: 'ProviderCredential',
          entityId: row.id,
          metadata: {
            providerId: provider.id,
            credentialMode: row.credentialMode,
            status: row.status,
            hasSecret: Boolean(row.secretCiphertext),
            markupBps: row.markupBps,
          },
        },
        tx,
      );
      return row;
    });

    return this.sanitize(credential);
  }

  async validateCredential(
    organizationId: string,
    actorUserId: string,
    providerId: string,
  ): Promise<SanitizedCredential | ProviderAvailability> {
    const provider = this.mustProvider(providerId);
    const credential =
      await this.prisma.organizationProviderCredential.findUnique({
        where: {
          organizationId_providerId: {
            organizationId,
            providerId: provider.id,
          },
        },
      });
    const secret = this.resolveSecret(provider, credential);

    if (!credential) {
      if (!secret.ok) {
        return this.availability(provider, null);
      }
      const validation = await this.validateProviderKey(provider, secret.key);
      return {
        ...this.availability(provider, null),
        organizationCredential: null,
        available: validation.status !== ProviderCredentialStatus.INVALID,
        availableVia: ProviderCredentialMode.FINOVA_MANAGED,
      };
    }

    const validation = secret.ok
      ? await this.validateProviderKey(provider, secret.key)
      : { status: ProviderCredentialStatus.INVALID, error: secret.error };
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organizationProviderCredential.update({
        where: { id: credential.id },
        data: {
          status: validation.status,
          validationError: validation.error,
          lastValidatedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.UPDATED,
          entityType: 'ProviderCredential',
          entityId: row.id,
          metadata: {
            providerId: provider.id,
            validationStatus: row.status,
          },
        },
        tx,
      );
      return row;
    });

    return this.sanitize(updated);
  }

  async deleteCredential(
    organizationId: string,
    actorUserId: string,
    providerId: string,
  ): Promise<{ ok: true }> {
    const provider = this.mustProvider(providerId);
    await this.prisma.$transaction(async (tx) => {
      const credential = await tx.organizationProviderCredential.findUnique({
        where: {
          organizationId_providerId: {
            organizationId,
            providerId: provider.id,
          },
        },
        select: { id: true, credentialMode: true, status: true },
      });
      if (!credential) {
        throw new NotFoundException('Provider credential not found');
      }
      await tx.organizationProviderCredential.delete({
        where: { id: credential.id },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.DELETED,
          entityType: 'ProviderCredential',
          entityId: credential.id,
          metadata: {
            providerId: provider.id,
            credentialMode: credential.credentialMode,
            status: credential.status,
          },
        },
        tx,
      );
    });
    return { ok: true };
  }

  private async credentialsByProvider(organizationId: string) {
    const rows = await this.prisma.organizationProviderCredential.findMany({
      where: { organizationId },
    });
    return new Map(rows.map((row) => [row.providerId, row]));
  }

  private availability(
    provider: ProviderDefinition,
    credential: OrganizationProviderCredential | null,
  ): ProviderAvailability {
    const finovaManagedAvailable = this.finovaManagedKey(provider) !== null;
    const organizationCredential = credential ? this.sanitize(credential) : null;
    const hasByokSecret = Boolean(credential?.secretCiphertext);
    let availableVia: ProviderCredentialMode | null = null;
    if (credential?.credentialMode === ProviderCredentialMode.BYOK) {
      availableVia =
        hasByokSecret && credential.status !== ProviderCredentialStatus.INVALID
          ? ProviderCredentialMode.BYOK
          : null;
    } else if (
      credential?.credentialMode === ProviderCredentialMode.FINOVA_MANAGED
    ) {
      availableVia =
        finovaManagedAvailable &&
        credential.status !== ProviderCredentialStatus.INVALID
          ? ProviderCredentialMode.FINOVA_MANAGED
          : null;
    } else {
      availableVia = finovaManagedAvailable
        ? ProviderCredentialMode.FINOVA_MANAGED
        : null;
    }
    return {
      id: provider.id,
      kind: provider.kind,
      label: provider.label,
      defaultModel: provider.defaultModel,
      supportsByok: true,
      supportsFinovaManaged: true,
      finovaManagedAvailable,
      organizationCredential,
      available: availableVia !== null,
      availableVia,
    };
  }

  private credentialData(
    provider: ProviderDefinition,
    dto: UpsertProviderCredentialDto,
    existing: OrganizationProviderCredential | null,
  ): ProviderCredentialMutationData {
    if (dto.credentialMode === ProviderCredentialMode.BYOK) {
      const apiKey = dto.apiKey?.trim();
      if (!apiKey && !existing?.secretCiphertext) {
        throw new BadRequestException(
          'apiKey is required when configuring BYOK for this provider',
        );
      }
      const encrypted = apiKey ? this.encryptSecret(apiKey) : null;
      return {
        credentialMode: ProviderCredentialMode.BYOK,
        status: ProviderCredentialStatus.CONFIGURED,
        ...(encrypted
          ? {
              keyPrefix: this.keyPrefix(apiKey!),
              keyFingerprint: this.fingerprint(apiKey!),
              secretCiphertext: encrypted.secretCiphertext,
              secretIv: encrypted.secretIv,
              secretAuthTag: encrypted.secretAuthTag,
            }
          : {}),
        validationError: null,
        markupBps: 0,
        metadata: this.metadataJson(dto.metadata),
      };
    }

    if (dto.apiKey?.trim()) {
      throw new BadRequestException(
        'apiKey is only accepted when configuring BYOK for this provider',
      );
    }

    const hasFinovaKey = this.finovaManagedKey(provider) !== null;
    return {
      credentialMode: ProviderCredentialMode.FINOVA_MANAGED,
      status: hasFinovaKey
        ? ProviderCredentialStatus.CONFIGURED
        : ProviderCredentialStatus.NOT_CONFIGURED,
      keyPrefix: null,
      keyFingerprint: null,
      secretCiphertext: null,
      secretIv: null,
      secretAuthTag: null,
      validationError: hasFinovaKey
        ? null
        : 'No Finova-managed key is configured for this provider',
      markupBps: dto.markupBps ?? existing?.markupBps ?? 0,
      metadata: this.metadataJson(dto.metadata),
    };
  }

  private sanitize(row: OrganizationProviderCredential): SanitizedCredential {
    const provider = providerById(row.providerId);
    return {
      id: row.id,
      providerId: row.providerId,
      kind: provider?.kind ?? 'unknown',
      label: provider?.label ?? row.providerId,
      credentialMode: row.credentialMode,
      status: row.status,
      keyPrefix: row.keyPrefix,
      hasSecret: Boolean(row.secretCiphertext),
      finovaManagedAvailable: provider
        ? this.finovaManagedKey(provider) !== null
        : false,
      validationError: row.validationError,
      lastValidatedAt: row.lastValidatedAt,
      lastUsedAt: row.lastUsedAt,
      markupBps: row.markupBps,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mustProvider(providerId: string): ProviderDefinition {
    const provider = providerById(providerId);
    if (!provider) {
      throw new BadRequestException(`Unsupported provider: ${providerId}`);
    }
    return provider;
  }

  private resolveSecret(
    provider: ProviderDefinition,
    credential: OrganizationProviderCredential | null,
  ): ResolvedSecret {
    if (credential?.credentialMode === ProviderCredentialMode.BYOK) {
      if (!credential.secretCiphertext || !credential.secretIv || !credential.secretAuthTag) {
        return {
          ok: false,
          credentialMode: ProviderCredentialMode.BYOK,
          error: 'BYOK credential has no stored API key',
        };
      }
      return {
        ok: true,
        key: this.decryptSecret(credential),
        credentialMode: ProviderCredentialMode.BYOK,
      };
    }

    const finovaKey = this.finovaManagedKey(provider);
    if (!finovaKey) {
      return {
        ok: false,
        credentialMode: ProviderCredentialMode.FINOVA_MANAGED,
        error: 'No Finova-managed key is configured for this provider',
      };
    }
    return {
      ok: true,
      key: finovaKey.value,
      credentialMode: ProviderCredentialMode.FINOVA_MANAGED,
    };
  }

  private async validateProviderKey(
    provider: ProviderDefinition,
    apiKey: string,
  ): Promise<{ status: ProviderCredentialStatus; error: string | null }> {
    if (provider.validationStyle === 'local-only') {
      return { status: ProviderCredentialStatus.CONFIGURED, error: null };
    }

    const request = this.validationRequest(provider, apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
    try {
      const response = await fetch(request.url, {
        method: 'GET',
        headers: request.headers,
        signal: controller.signal,
      });
      if (response.ok) {
        return { status: ProviderCredentialStatus.VALID, error: null };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          status: ProviderCredentialStatus.INVALID,
          error: `Provider rejected the credential with HTTP ${response.status}`,
        };
      }
      return {
        status: ProviderCredentialStatus.CONFIGURED,
        error: `Provider validation returned HTTP ${response.status}`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: ProviderCredentialStatus.CONFIGURED,
        error: `Provider validation could not complete: ${message}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private validationRequest(
    provider: ProviderDefinition,
    apiKey: string,
  ): { url: string; headers: Record<string, string> } {
    switch (provider.validationStyle) {
      case 'rime-voices':
        return {
          url: 'https://users.rime.ai/data/voices/voice_details.json',
          headers: { Authorization: `Bearer ${apiKey}` },
        };
      case 'openai-models':
        return {
          url:
            provider.id === 'groq' || provider.id === 'groq-whisper'
              ? 'https://api.groq.com/openai/v1/models'
              : 'https://api.openai.com/v1/models',
          headers: { Authorization: `Bearer ${apiKey}` },
        };
      case 'anthropic-models':
        return {
          url: 'https://api.anthropic.com/v1/models',
          headers: {
            'anthropic-version': '2023-06-01',
            'x-api-key': apiKey,
          },
        };
      case 'deepgram-projects':
        return {
          url: 'https://api.deepgram.com/v1/projects',
          headers: { Authorization: `Token ${apiKey}` },
        };
      case 'cartesia-voices':
        return {
          url: 'https://api.cartesia.ai/voices?limit=1',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Cartesia-Version': CARTESIA_API_VERSION,
            'X-API-Key': apiKey,
          },
        };
      case 'elevenlabs-models':
        return {
          url: 'https://api.elevenlabs.io/v1/models',
          headers: { 'xi-api-key': apiKey },
        };
      case 'assemblyai-transcripts':
        return {
          url: 'https://api.assemblyai.com/v2/transcript?limit=1',
          headers: { Authorization: apiKey },
        };
      case 'local-only':
        return { url: '', headers: {} };
    }
  }

  private finovaManagedKey(
    provider: ProviderDefinition,
  ): { value: string; envVar: string } | null {
    for (const envVar of provider.finovaEnvVars) {
      const value = this.config.get<string>(envVar)?.trim();
      if (value) {
        return { value, envVar };
      }
    }
    return null;
  }

  private encryptSecret(secret: string) {
    const iv = randomBytes(AES_GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv, {
      authTagLength: AES_GCM_AUTH_TAG_BYTES,
    });
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return {
      secretCiphertext: ciphertext.toString('base64'),
      secretIv: iv.toString('base64'),
      secretAuthTag: cipher.getAuthTag().toString('base64'),
    };
  }

  private decryptSecret(row: {
    secretCiphertext: string | null;
    secretIv: string | null;
    secretAuthTag: string | null;
  }): string {
    if (!row.secretCiphertext || !row.secretIv || !row.secretAuthTag) {
      throw new BadRequestException('Provider credential has no stored secret');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(row.secretIv, 'base64'),
      { authTagLength: AES_GCM_AUTH_TAG_BYTES },
    );
    decipher.setAuthTag(Buffer.from(row.secretAuthTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.secretCiphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    const raw = this.config.get<string>('PROVIDER_CREDENTIAL_ENCRYPTION_KEY')?.trim();
    if (!raw) {
      throw new ServiceUnavailableException(
        'PROVIDER_CREDENTIAL_ENCRYPTION_KEY is required for BYOK credentials',
      );
    }

    const hex = this.tryDecodeKey(raw, 'hex');
    if (hex) {
      return hex;
    }
    const base64 = this.tryDecodeKey(raw, 'base64');
    if (base64) {
      return base64;
    }
    if (raw.length < 32) {
      throw new ServiceUnavailableException(
        'PROVIDER_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters, 64 hex characters, or 32 bytes base64',
      );
    }
    return createHash('sha256').update(raw).digest();
  }

  private tryDecodeKey(value: string, encoding: BufferEncoding): Buffer | null {
    try {
      const decoded = Buffer.from(value, encoding);
      if (decoded.length === 32) {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }

  private keyPrefix(apiKey: string): string {
    return apiKey.slice(0, KEY_PREFIX_LENGTH);
  }

  private fingerprint(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private metadataJson(
    metadata: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue | undefined {
    return metadata === undefined
      ? undefined
      : (metadata as Prisma.InputJsonObject);
  }
}
