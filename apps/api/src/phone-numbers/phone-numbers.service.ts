import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { PatchPhoneNumberDto } from './dto/patch-phone-number.dto';
import type { RegisterPhoneNumberDto } from './dto/register-phone-number.dto';
import { LiveKitSipService } from './livekit-sip.service';

@Injectable()
export class PhoneNumbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveKitSip: LiveKitSipService,
  ) {}

  list(organizationId: string) {
    return this.prisma.phoneNumber.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  async register(organizationId: string, dto: RegisterPhoneNumberDto) {
    try {
      return await this.prisma.phoneNumber.create({
        data: {
          organizationId,
          number: dto.number,
          friendlyName: dto.friendlyName,
          twilioSid: dto.twilioSid,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Phone number already registered');
      }
      throw error;
    }
  }

  async update(
    organizationId: string,
    phoneNumberId: string,
    dto: PatchPhoneNumberDto,
  ) {
    const phoneNumber = await this.getPhoneNumber(organizationId, phoneNumberId);
    const data: Prisma.PhoneNumberUpdateInput = {};

    if (dto.agentId !== undefined) {
      if (dto.agentId === null) {
        data.agent = { disconnect: true };
        if (phoneNumber.liveKitDispatchRuleId) {
          await this.liveKitSip.deleteDispatchRule(
            phoneNumber.liveKitDispatchRuleId,
          );
          data.liveKitDispatchRuleId = null;
        }
      } else {
        await this.ensureAgent(organizationId, dto.agentId);
        data.agent = { connect: { id: dto.agentId } };
      }
    }
    if (dto.friendlyName !== undefined) {
      data.friendlyName =
        dto.friendlyName && dto.friendlyName.length > 0
          ? dto.friendlyName
          : null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No phone number fields to update');
    }

    return this.prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data,
      include: { agent: true },
    });
  }

  async syncDispatchRule(organizationId: string, phoneNumberId: string) {
    const phoneNumber = await this.getPhoneNumber(organizationId, phoneNumberId);
    if (!phoneNumber.agentId) {
      throw new BadRequestException('Phone number is not assigned to an agent');
    }
    await this.ensureAgent(organizationId, phoneNumber.agentId);

    if (phoneNumber.liveKitDispatchRuleId) {
      await this.liveKitSip.deleteDispatchRule(phoneNumber.liveKitDispatchRuleId);
    }
    const dispatchRuleId = await this.liveKitSip.createInboundDispatchRule({
      agentId: phoneNumber.agentId,
      organizationId,
      phoneNumber: phoneNumber.number,
    });

    return this.prisma.phoneNumber.update({
      where: { id: phoneNumber.id },
      data: { liveKitDispatchRuleId: dispatchRuleId },
      include: { agent: true },
    });
  }

  private async getPhoneNumber(organizationId: string, phoneNumberId: string) {
    const phoneNumber = await this.prisma.phoneNumber.findFirst({
      where: { id: phoneNumberId, organizationId },
    });
    if (!phoneNumber) {
      throw new NotFoundException('Phone number not found');
    }
    return phoneNumber;
  }

  private async ensureAgent(
    organizationId: string,
    agentId: string,
  ): Promise<void> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!agent) {
      throw new BadRequestException('Agent is not available in this org');
    }
  }
}
