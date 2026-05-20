import { IsEmail, IsIn } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn([Role.ADMIN, Role.BUILDER, Role.VIEWER])
  role!: Role;
}
