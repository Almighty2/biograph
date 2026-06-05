import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Mot de passe actuel', example: 'OldPassword123!' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'Nouveau mot de passe', example: 'NewPassword456!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(100)
  newPassword: string;
}