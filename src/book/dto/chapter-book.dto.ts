import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ─── Chapitre ──────────────────────────────────────────────────────────────

export class CreateChapterDto {
  @ApiProperty({ description: 'Titre du chapitre', example: 'L\'enfance au village' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiProperty({ description: 'Position dans le livre', example: 1 })
  @IsInt()
  @Min(1)
  position: number;

  @ApiPropertyOptional({ description: 'Contenu du chapitre (HTML ou JSON riche)' })
  @IsOptional()
  @IsString()
  content?: string;
}

export class UpdateChapterDto {
  @ApiPropertyOptional({ example: 'L\'enfance au village' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  title?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @ApiPropertyOptional({ description: 'Contenu du chapitre' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Marquer comme complet', example: false })
  @IsOptional()
  @IsBoolean()
  isComplete?: boolean;
}

// ─── Sous-Chapitre ─────────────────────────────────────────────────────────

export class CreateSubChapterDto {
  @ApiProperty({ description: 'Titre du sous-chapitre', example: 'Le marché de Bouaké' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiProperty({ description: 'Position dans le chapitre', example: 1 })
  @IsInt()
  @Min(1)
  position: number;

  @ApiPropertyOptional({ description: 'Contenu du sous-chapitre' })
  @IsOptional()
  @IsString()
  content?: string;
}

export class UpdateSubChapterDto {
  @ApiPropertyOptional({ example: 'Le marché de Bouaké' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  title?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;
}