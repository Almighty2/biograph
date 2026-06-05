import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUrl,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BookGenre, BookStatus, Visibility } from '../enums/book.enum';

export class CreateBookDto {
  @ApiProperty({ description: 'Titre du livre', example: 'Ma vie en Côte d\'Ivoire' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiPropertyOptional({ description: 'Sous-titre', example: 'Une histoire de résilience' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Description / résumé', example: 'Ce livre retrace...' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Langue du livre',
    example: 'fr',
    default: 'fr',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'Genre littéraire',
    enum: BookGenre,
    default: BookGenre.AUTOBIOGRAPHY,
  })
  @IsOptional()
  @IsEnum(BookGenre)
  genre?: BookGenre;

  @ApiPropertyOptional({
    description: 'Visibilité du livre',
    enum: Visibility,
    default: Visibility.PRIVATE,
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ description: 'Objectif en nombre de mots', example: 50000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetWordCount?: number;

  @ApiPropertyOptional({ description: 'Objectif en nombre de pages', example: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetPageCount?: number;

  @ApiPropertyOptional({ description: 'URL de la couverture', example: 'https://cdn.example.com/cover.jpg' })
  @IsOptional()
  @IsUrl({}, { message: "L'URL de la couverture est invalide" })
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Style de couverture IA', example: 'vintage' })
  @IsOptional()
  @IsString()
  coverStyle?: string;
}