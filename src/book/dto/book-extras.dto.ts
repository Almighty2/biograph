import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CollaborationRole, ExportFormat, Visibility } from '../enums/book.enum';

// ─── Collaboration ─────────────────────────────────────────────────────────

export class InviteCollaboratorDto {
  @ApiProperty({ description: "Email du collaborateur", example: 'collaborateur@example.com' })
  @IsEmail({}, { message: 'Email invalide' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiPropertyOptional({
    description: 'Rôle accordé',
    enum: CollaborationRole,
    default: CollaborationRole.READER,
  })
  @IsOptional()
  @IsEnum(CollaborationRole)
  role?: CollaborationRole;
}

export class UpdateCollaboratorRoleDto {
  @ApiProperty({ enum: CollaborationRole })
  @IsEnum(CollaborationRole)
  role: CollaborationRole;
}

// ─── Export ────────────────────────────────────────────────────────────────

export class ExportBookDto {
  @ApiProperty({
    description: 'Format d\'export',
    enum: ExportFormat,
    example: ExportFormat.PDF,
  })
  @IsEnum(ExportFormat)
  format: ExportFormat;
}

// ─── Version ───────────────────────────────────────────────────────────────

export class CreateVersionDto {
  @ApiPropertyOptional({
    description: 'Libellé de la version',
    example: 'Version finale avant relecture',
  })
  @IsOptional()
  @IsString()
  label?: string;
}

// ─── Visibilité & Partage ──────────────────────────────────────────────────

export class UpdateVisibilityDto {
  @ApiProperty({ enum: Visibility })
  @IsEnum(Visibility)
  visibility: Visibility;
}

// ─── Tags ──────────────────────────────────────────────────────────────────

export class AddTagsDto {
  @ApiProperty({
    description: 'Liste des noms de tags',
    example: ['mémoire familiale', 'histoire orale'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  tags: string[];
}

// ─── Favori ────────────────────────────────────────────────────────────────

export class AddFavoriteDto {
  @ApiPropertyOptional({ description: 'ID du chapitre (optionnel)', example: 'clxxx123' })
  @IsOptional()
  @IsString()
  chapterId?: string;

  @ApiPropertyOptional({ description: 'Note personnelle', example: 'Passage clé à relire' })
  @IsOptional()
  @IsString()
  note?: string;
}