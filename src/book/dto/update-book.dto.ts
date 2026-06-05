import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsUrl,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BookGenre, BookStatus, Visibility } from '../enums/book.enum';

export class UpdateBookDto {
  @ApiPropertyOptional({ example: 'Ma vie en Côte d\'Ivoire' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  title?: string;

  @ApiPropertyOptional({ example: 'Une histoire de résilience' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Ce livre retrace...' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: BookGenre })
  @IsOptional()
  @IsEnum(BookGenre)
  genre?: BookGenre;

  @ApiPropertyOptional({ enum: BookStatus })
  @IsOptional()
  @IsEnum(BookStatus)
  status?: BookStatus;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetWordCount?: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetPageCount?: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cover.jpg' })
  @IsOptional()
  @IsUrl({}, { message: "L'URL de la couverture est invalide" })
  coverImageUrl?: string;

  @ApiPropertyOptional({ example: 'vintage' })
  @IsOptional()
  @IsString()
  coverStyle?: string;

  @ApiPropertyOptional({ description: 'Marquer comme premium', example: false })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;
}