import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsObject,
  Matches,
} from 'class-validator';

// ─── Enums ────────────────────────────────────────────────────────────────

export enum NotificationType {
  WRITING_REMINDER     = 'WRITING_REMINDER',
  COLLABORATION_INVITE = 'COLLABORATION_INVITE',
  ORDER_UPDATE         = 'ORDER_UPDATE',
  AI_SUGGESTION        = 'AI_SUGGESTION',
  SYSTEM               = 'SYSTEM',
}

export enum ReminderFrequency {
  DAILY       = 'DAILY',
  EVERY_2_DAYS = 'EVERY_2_DAYS',
  WEEKLY      = 'WEEKLY',
}

// ─── Notifications ────────────────────────────────────────────────────────

export class CreateNotificationDto {
  @ApiProperty({ description: 'ID de l\'utilisateur destinataire', example: 'clxUSR001' })
  @IsString()
  userId: string;

  @ApiProperty({ enum: NotificationType, example: NotificationType.SYSTEM })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ example: 'Votre commande a été expédiée' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Votre livre "Ma vie en CI" est en route. Code de suivi : CI123456' })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'Données contextuelles selon le type de notification',
    examples: {
      order_update:          { value: { orderId: 'clxORD001', status: 'SHIPPED', trackingCode: 'CI123456' } },
      collaboration_invite:  { value: { bookId: 'clxBOOK001', bookTitle: 'Ma vie', invitedBy: 'Jean Dupont' } },
      ai_suggestion:         { value: { suggestionId: 'clxAI001', bookId: 'clxBOOK001', type: 'CHAPTER_DRAFT' } },
      writing_reminder:      { value: { bookId: 'clxBOOK001', bookTitle: 'Ma vie', targetWordCount: 50000 } },
    },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

export class MarkReadDto {
  @ApiProperty({
    description: 'IDs des notifications à marquer comme lues',
    example: ['clxNOT001', 'clxNOT002'],
    type: [String],
  })
  @IsString({ each: true })
  ids: string[];
}

export class NotificationFilterDto {
  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ description: 'Filtrer par statut de lecture', example: false })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}

// ─── Writing Reminders ────────────────────────────────────────────────────

export class CreateWritingReminderDto {
  @ApiPropertyOptional({
    description: 'ID du livre concerné (optionnel — si absent, rappel global)',
    example: 'clxBOOK001',
  })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({
    description: 'Fréquence du rappel',
    enum: ReminderFrequency,
    default: ReminderFrequency.DAILY,
  })
  @IsOptional()
  @IsEnum(ReminderFrequency)
  frequency?: ReminderFrequency;

  @ApiProperty({
    description: 'Heure du rappel au format HH:MM',
    example: '09:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'L\'heure doit être au format HH:MM (ex: 09:00)',
  })
  time: string;
}

export class UpdateWritingReminderDto {
  @ApiPropertyOptional({ enum: ReminderFrequency })
  @IsOptional()
  @IsEnum(ReminderFrequency)
  frequency?: ReminderFrequency;

  @ApiPropertyOptional({ example: '20:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'L\'heure doit être au format HH:MM (ex: 20:00)',
  })
  time?: string;

  @ApiPropertyOptional({ description: 'Activer ou désactiver le rappel', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}