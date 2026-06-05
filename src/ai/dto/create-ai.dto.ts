import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AiSuggestionType } from '../enums/ai-suggestionType.enum';

// ─── AiSuggestion ──────────────────────────────────────────────────────────

export class CreateAiSuggestionDto {
  @ApiProperty({
    description: "Type de suggestion demandée",
    enum: AiSuggestionType,
    example: AiSuggestionType.CHAPTER_DRAFT,
  })
  @IsEnum(AiSuggestionType)
  type: AiSuggestionType;

  @ApiProperty({
    description: "Instruction / prompt envoyé à l'IA",
    example: "Rédige une introduction pour un chapitre sur l'enfance en milieu rural en Côte d'Ivoire",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({
    description: "ID du livre concerné (optionnel)",
    example: 'clxABC123',
  })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiPropertyOptional({
    description: "ID du chapitre concerné (optionnel)",
    example: 'clxCH001',
  })
  @IsOptional()
  @IsString()
  chapterId?: string;
}

export class AcceptSuggestionDto {
  @ApiProperty({
    description: "Accepter ou refuser la suggestion",
    example: true,
  })
  @IsBoolean()
  isAccepted: boolean;
}

// ─── CoverGeneration ───────────────────────────────────────────────────────

export class CreateCoverGenerationDto {
  @ApiProperty({
    description: "Prompt décrivant la couverture souhaitée",
    example: "Une couverture avec un baobab au coucher du soleil sur fond de savane africaine",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  prompt: string;

  @ApiProperty({
    description: "Style visuel de la couverture",
    example: "vintage",
  })
  @IsString()
  @MaxLength(100)
  style: string;
}