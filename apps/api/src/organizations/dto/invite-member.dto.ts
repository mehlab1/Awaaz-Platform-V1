import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteMemberDto {
  @ApiProperty({ example: 'teammate@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: [Role.ADMIN, Role.BUILDER, Role.VIEWER] })
  @IsIn([Role.ADMIN, Role.BUILDER, Role.VIEWER])
  role!: Role;
}
