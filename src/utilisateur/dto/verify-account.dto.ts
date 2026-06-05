import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyAccountDto {
  @ApiProperty({ example: 'token_recu_par_mail' })
  @IsString()
  @IsNotEmpty()
  token: string;
}