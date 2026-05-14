import type { Role } from '@prisma/client';

const ROLE_ORDER: Record<Role, number> = {
  VIEWER: 0,
  BUILDER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function meetsMinimumRole(userRole: Role, minimum: Role): boolean {
  return ROLE_ORDER[userRole] >= ROLE_ORDER[minimum];
}
