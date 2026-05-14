import type { OrganizationMembershipRole } from '@clerk/backend';
import { Role } from '@prisma/client';

export function toClerkOrganizationRole(role: Role): OrganizationMembershipRole {
  if (role === Role.ADMIN || role === Role.OWNER) {
    return 'org:admin';
  }
  return 'org:member';
}

export function mapClerkMembershipRoleToDbRole(clerkRole: string): Role {
  if (clerkRole === 'org:admin') {
    return Role.ADMIN;
  }
  return Role.VIEWER;
}
