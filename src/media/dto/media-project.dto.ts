import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MediaType, VoiceGender } from 'src/ai/enums/ai-suggestionType.enum';

export class CreateMediaProjectDto {
  @ApiProperty({
    description: 'Type de projet multimédia',
    enum: MediaType,
    example: MediaType.AUDIO_NARRATION,
  })
  @IsEnum(MediaType)
  type: MediaType;

  @ApiProperty({
    description: 'Titre du projet multimédia',
    example: 'Narration audio — Ma vie en Côte d\'Ivoire',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Langue de la narration',
    example: 'fr',
    default: 'fr',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'Genre de la voix de synthèse',
    enum: VoiceGender,
    default: VoiceGender.FEMALE,
  })
  @IsOptional()
  @IsEnum(VoiceGender)
  voiceGender?: VoiceGender;

  @ApiPropertyOptional({
    description: 'ID de la voix spécifique (ex: ElevenLabs voice ID)',
    example: 'EXAVITQu4vr4xnSDxMaL',
  })
  @IsOptional()
  @IsString()
  voiceId?: string;

  @ApiPropertyOptional({
    description: 'Piste musicale de fond',
    example: 'afrobeat-soft',
  })
  @IsOptional()
  @IsString()
  musicTrack?: string;
}

export class UpdateMediaProjectDto {
  @ApiPropertyOptional({ example: 'Narration v2' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: VoiceGender })
  @IsOptional()
  @IsEnum(VoiceGender)
  voiceGender?: VoiceGender;

  @ApiPropertyOptional({ example: 'EXAVITQu4vr4xnSDxMaL' })
  @IsOptional()
  @IsString()
  voiceId?: string;

  @ApiPropertyOptional({ example: 'afrobeat-soft' })
  @IsOptional()
  @IsString()
  musicTrack?: string;
}