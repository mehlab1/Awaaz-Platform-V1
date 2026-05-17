import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const ORGANIZATION_NAME = env('SIRIUS_SEED_ORG_NAME', 'Finova Solutions');
const ORGANIZATION_SLUG = env('SIRIUS_SEED_ORG_SLUG', 'finova-solutions');
const CLERK_ORGANIZATION_ID = env(
  'SIRIUS_SEED_CLERK_ORG_ID',
  'org_3DobiMdp5YIaxZaDjPyNAizYrAN',
);
const OWNER_USER_ID = env(
  'SIRIUS_SEED_OWNER_USER_ID',
  'user_3Do8hbNCi3SeLo5dyC86hl7pttr',
);
const OWNER_EMAIL = env('SIRIUS_SEED_OWNER_EMAIL', 'habibaimrannn@gmail.com');
const SIRIUS_PHONE_NUMBER = env('SIRIUS_SEED_PHONE_NUMBER', '+15550174243');
const SIRIUS_VOICE_ID = env('SIRIUS_SEED_VOICE_ID', 'astra');

const SIRIUS_AGENT_NAME = 'Sirius Agent';
const SIRIUS_DESCRIPTION = 'Default Finova voice agent for inbound calls.';
const SIRIUS_SYSTEM_PROMPT = `
You are Sirius, Finova Solutions' calm, professional AI phone agent.
Your job is to greet callers, understand why they called, answer concise questions,
collect the caller's name and phone number when useful, and escalate when a human
team member is needed. Be warm, direct, and never invent company policy.
If the caller asks for a human, says this is urgent, or seems frustrated, offer to
transfer or take a clear callback note.
`.trim();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: ORGANIZATION_SLUG },
    update: {
      name: ORGANIZATION_NAME,
      clerkOrganizationId: CLERK_ORGANIZATION_ID,
    },
    create: {
      name: ORGANIZATION_NAME,
      slug: ORGANIZATION_SLUG,
      clerkOrganizationId: CLERK_ORGANIZATION_ID,
    },
  });

  const owner = await prisma.user.upsert({
    where: { id: OWNER_USER_ID },
    update: { email: OWNER_EMAIL },
    create: {
      id: OWNER_USER_ID,
      email: OWNER_EMAIL,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: owner.id,
        organizationId: organization.id,
      },
    },
    update: { role: Role.OWNER },
    create: {
      userId: owner.id,
      organizationId: organization.id,
      role: Role.OWNER,
    },
  });

  const existingSirius = await prisma.agent.findFirst({
    where: {
      organizationId: organization.id,
      name: SIRIUS_AGENT_NAME,
    },
  });

  const sirius = existingSirius
    ? await prisma.agent.update({
        where: { id: existingSirius.id },
        data: {
          description: SIRIUS_DESCRIPTION,
          isActive: true,
          deletedAt: null,
        },
      })
    : await prisma.agent.create({
        data: {
          organizationId: organization.id,
          name: SIRIUS_AGENT_NAME,
          description: SIRIUS_DESCRIPTION,
          isActive: true,
        },
      });

  const publishedAt = new Date();
  const version = await prisma.$transaction(async (tx) => {
    const v1 = await tx.agentVersion.upsert({
      where: {
        agentId_versionNumber: {
          agentId: sirius.id,
          versionNumber: 1,
        },
      },
      update: {
        systemPrompt: SIRIUS_SYSTEM_PROMPT,
        voiceId: SIRIUS_VOICE_ID,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.55,
        maxTokens: 900,
        firstMessage:
          'Hi, this is Sirius from Finova Solutions. How can I help you today?',
        endCallPhrases: ['goodbye', 'bye', 'that is all', 'thank you'],
        isLive: true,
        publishedAt,
      },
      create: {
        agentId: sirius.id,
        versionNumber: 1,
        systemPrompt: SIRIUS_SYSTEM_PROMPT,
        voiceId: SIRIUS_VOICE_ID,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.55,
        maxTokens: 900,
        firstMessage:
          'Hi, this is Sirius from Finova Solutions. How can I help you today?',
        endCallPhrases: ['goodbye', 'bye', 'that is all', 'thank you'],
        isLive: true,
        publishedAt,
      },
    });

    await tx.agentVersion.updateMany({
      where: {
        agentId: sirius.id,
        id: { not: v1.id },
      },
      data: { isLive: false },
    });

    await tx.agent.update({
      where: { id: sirius.id },
      data: {
        currentVersionId: v1.id,
        isActive: true,
        deletedAt: null,
      },
    });

    return v1;
  });

  const phoneNumber = await prisma.phoneNumber.upsert({
    where: { number: SIRIUS_PHONE_NUMBER },
    update: {
      organizationId: organization.id,
      agentId: sirius.id,
      friendlyName: 'Sirius Seed Number',
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      agentId: sirius.id,
      number: SIRIUS_PHONE_NUMBER,
      friendlyName: 'Sirius Seed Number',
      isActive: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        organization: {
          id: organization.id,
          name: organization.name,
        },
        owner: {
          id: owner.id,
          email: owner.email,
        },
        agent: {
          id: sirius.id,
          name: sirius.name,
          currentVersionId: version.id,
        },
        version: {
          id: version.id,
          versionNumber: version.versionNumber,
          isLive: version.isLive,
        },
        phoneNumber: {
          id: phoneNumber.id,
          number: phoneNumber.number,
          agentId: phoneNumber.agentId,
          liveKitDispatchRuleId: phoneNumber.liveKitDispatchRuleId,
        },
      },
      null,
      2,
    ),
  );
}

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
