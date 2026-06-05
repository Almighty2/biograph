import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export enum ImageSource {
  UPLOAD = 'UPLOAD',
  AI_GENERATED = 'AI_GENERATED',
  URL = 'URL',
}

export class CreateChapterImageDto {
  @ApiProperty({
    description: "URL de l'image",
    example: 'https://cdn.example.com/photo-famille.jpg',
  })
  @IsUrl({}, { message: "L'URL de l'image est invalide" })
  url: string;

  @ApiPropertyOptional({
    description: 'Légende affichée sous l\'image',
    example: 'Ma famille en 1990 devant la maison',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  caption?: string;

  @ApiPropertyOptional({
    description: 'Texte alternatif pour l\'accessibilité',
    example: 'Photo de famille devant une maison en terre',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;

  @ApiProperty({
    description: 'Position de l\'image dans le chapitre',
    example: 1,
  })
  @IsInt()
  @Min(1)
  position: number;

  @ApiPropertyOptional({
    description: 'Source de l\'image',
    enum: ImageSource,
    default: ImageSource.UPLOAD,
  })
  @IsOptional()
  @IsEnum(ImageSource)
  source?: ImageSource;
}

export class UpdateChapterImageDto {
  @ApiPropertyOptional({
    description: 'Nouvelle URL',
    example: 'https://cdn.example.com/photo-v2.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: "L'URL est invalide" })
  url?: string;

  @ApiPropertyOptional({ example: 'Ma famille en 1990' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  caption?: string;

  @ApiPropertyOptional({ example: 'Photo de famille' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}