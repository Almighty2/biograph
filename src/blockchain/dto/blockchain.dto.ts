import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, IsEnum, ArrayMinSize } from 'class-validator';
// ✅ Importer l'enum depuis Prisma
import { BlockchainNetwork } from '@prisma/client';
export class CreateAnchorDto {
  @ApiProperty({
    description: 'IDs des livres a ancrer',
    example: ['clxBOOK001', 'clxBOOK002'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  bookIds: string[];

  @ApiPropertyOptional({
    description: 'Reseau blockchain (BITCOIN_OTS = gratuit via OpenTimestamps)',
    enum: BlockchainNetwork,
    default: BlockchainNetwork.BITCOIN_OTS,
  })
  @IsOptional()
  @IsEnum(BlockchainNetwork)
  network?: BlockchainNetwork;
}

export class ConfirmAnchorDto {
  @ApiProperty({ description: 'Hash de la transaction blockchain' })
  @IsString()
  txHash: string;

  @ApiPropertyOptional({ enum: BlockchainNetwork })
  @IsOptional()
  @IsEnum(BlockchainNetwork)
  network?: BlockchainNetwork;
}