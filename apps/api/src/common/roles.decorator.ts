import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'awaaz_min_role';

export const Roles = (minimum: Role) => SetMetadata(ROLES_KEY, minimum);
