import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      organizationId?: string;
      userRole?: Role;
      user?: {
        id: string;
      };
    }
  }
}

export {};
