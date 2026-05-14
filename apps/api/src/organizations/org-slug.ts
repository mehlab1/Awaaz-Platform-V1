import type { PrismaService } from '../prisma/prisma.service';

export function slugifyOrganizationName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'org';
}

export async function allocateUniqueOrgSlug(
  prisma: PrismaService,
  name: string,
  preferred?: string,
): Promise<string> {
  const base = preferred
    ? slugifyOrganizationName(preferred)
    : slugifyOrganizationName(name);
  let candidate = base;
  let suffix = 0;
  for (;;) {
    const clash = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}
