import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SipClient } from 'livekit-server-sdk';

interface DispatchRuleInput {
  agentId: string;
  organizationId: string;
  phoneNumber: string;
}

@Injectable()
export class LiveKitSipService {
  constructor(private readonly config: ConfigService) {}

  async createInboundDispatchRule(input: DispatchRuleInput): Promise<string> {
    const metadata = JSON.stringify({
      agentId: input.agentId,
      organizationId: input.organizationId,
      direction: 'INBOUND',
      phoneNumber: input.phoneNumber,
    });
    const rule = await this.client().createSipDispatchRule(
      { type: 'individual', roomPrefix: 'call-inbound-' },
      {
        name: `dispatch-${input.phoneNumber}`,
        metadata,
        attributes: {
          agentId: input.agentId,
          organizationId: input.organizationId,
          phoneNumber: input.phoneNumber,
        },
      },
    );
    return rule.sipDispatchRuleId;
  }

  async deleteDispatchRule(dispatchRuleId: string): Promise<void> {
    await this.client().deleteSipDispatchRule(dispatchRuleId);
  }

  private client(): SipClient {
    const liveKitUrl = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!liveKitUrl || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException('LiveKit SIP is not configured');
    }
    return new SipClient(this.apiHost(liveKitUrl), apiKey, apiSecret);
  }

  private apiHost(liveKitUrl: string): string {
    if (liveKitUrl.startsWith('wss://')) {
      return `https://${liveKitUrl.slice('wss://'.length)}`;
    }
    if (liveKitUrl.startsWith('ws://')) {
      return `http://${liveKitUrl.slice('ws://'.length)}`;
    }
    return liveKitUrl;
  }
}
