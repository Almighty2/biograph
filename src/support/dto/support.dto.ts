import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';

// ─── Enums ────────────────────────────────────────────────────────────────

export enum SupportStatus {
  OPEN        = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED    = 'RESOLVED',
  CLOSED      = 'CLOSED',
}

export enum SenderType {
  USER  = 'USER',
  AGENT = 'AGENT',
  BOT   = 'BOT',
}

// Transitions autorisées
export const SUPPORT_TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  [SupportStatus.OPEN]:        [SupportStatus.IN_PROGRESS, SupportStatus.CLOSED],
  [SupportStatus.IN_PROGRESS]: [SupportStatus.RESOLVED,    SupportStatus.CLOSED],
  [SupportStatus.RESOLVED]:    [SupportStatus.OPEN,         SupportStatus.CLOSED],
  [SupportStatus.CLOSED]:      [SupportStatus.OPEN],
};

// ─── Thread ───────────────────────────────────────────────────────────────

export class CreateThreadDto {
  @ApiProperty({
    description: 'Sujet de la discussion',
    example: 'Impossible d\'exporter mon livre en PDF',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Premier message décrivant le problème',
    example: 'Bonjour, quand je clique sur Exporter en PDF, je reçois une erreur 500...',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message: string;
}

export class UpdateThreadStatusDto {
  @ApiProperty({
    description: 'Nouveau statut du thread',
    enum: SupportStatus,
    example: SupportStatus.IN_PROGRESS,
  })
  @IsEnum(SupportStatus)
  status: SupportStatus;

  @ApiPropertyOptional({
    description: 'Note interne sur le changement de statut',
    example: 'Pris en charge par l\'équipe technique',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ─── Message ──────────────────────────────────────────────────────────────

export class SendMessageDto {
  @ApiProperty({
    description: 'Contenu du message',
    example: 'Merci pour votre retour, nous allons investiguer.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({
    description: 'Type d\'expéditeur (USER par défaut)',
    enum: SenderType,
    default: SenderType.USER,
  })
  @IsOptional()
  @IsEnum(SenderType)
  senderType?: SenderType;

  @ApiPropertyOptional({
    description: 'ID de l\'expéditeur (null pour BOT)',
    example: 'clxAGENT001',
  })
  @IsOptional()
  @IsString()
  senderId?: string;
}