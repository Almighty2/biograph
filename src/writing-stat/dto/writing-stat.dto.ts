import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';

// ─── Enregistrer / mettre à jour une session d'écriture ───────────────────

export class UpsertWritingStatDto {
  @ApiPropertyOptional({
    description: 'ID du livre concerné (optionnel — session globale si absent)',
    example: 'clxBOOK001',
  })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({
    description: 'Date de la session (YYYY-MM-DD) — aujourd\'hui par défaut',
    example: '2025-04-12',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({
    description: 'Nombre de mots écrits durant la session',
    example: 350,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  wordsWritten: number;

  @ApiProperty({
    description: 'Temps passé à écrire en minutes',
    example: 45,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  minutesSpent: number;
}

// ─── Filtres pour les statistiques ───────────────────────────────────────

export class StatFilterDto {
  @ApiPropertyOptional({
    description: 'Filtrer par livre',
    example: 'clxBOOK001',
  })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({
    description: 'Date de début (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Date de fin (YYYY-MM-DD)',
    example: '2025-04-12',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}