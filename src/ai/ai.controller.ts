import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AiService } from './ai.service';
import {
  CreateAiSuggestionDto,
  AcceptSuggestionDto,
  CreateCoverGenerationDto,
} from './dto/create-ai.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai-suggestions')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // AI SUGGESTIONS
  // ══════════════════════════════════════════════════════════════════════════

  @Post('ai/suggestions')
  @ApiOperation({
    summary: 'Générer une suggestion IA',
    description: `
        Types disponibles :
        - BOOK_PLAN → plan complet du livre
        - CHAPTER_DRAFT → brouillon d'un chapitre
        - SENTENCE_SUGGESTION → suggestion de phrase/passage
        - CORRECTION → correction grammaticale et stylistique
        - NARRATIVE_ADVICE → conseil narratif
        - COVER_PROMPT → prompt pour génération de couverture
    `,
  })
  @ApiResponse({ status: 201, description: 'Suggestion générée' })
  async createSuggestion(
    @Query('userId') userId: string,
    @Body() dto: CreateAiSuggestionDto,
  ) {
    return this.aiService.createSuggestion(userId, dto);
  }

  @Get('books/:bookId/ai/suggestions')
  @ApiOperation({ summary: 'Lister toutes les suggestions IA d\'un livre' })
  @ApiParam({ name: 'bookId' })
  async getSuggestionsForBook(
    @Param('bookId') bookId: string,
    @Query('userId') userId: string,
  ) {
    return this.aiService.getSuggestionsForBook(bookId, userId);
  }

  @Get('books/:bookId/chapters/:chapterId/ai/suggestions')
  @ApiOperation({ summary: 'Lister les suggestions IA d\'un chapitre' })
  @ApiParam({ name: 'bookId' })
  @ApiParam({ name: 'chapterId' })
  async getSuggestionsForChapter(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Query('userId') userId: string,
  ) {
    return this.aiService.getSuggestionsForChapter(bookId, chapterId, userId);
  }

  @Patch('ai/suggestions/:suggestionId/accept')
  @ApiOperation({ summary: 'Accepter ou refuser une suggestion IA' })
  @ApiParam({ name: 'suggestionId' })
  async acceptOrReject(
    @Param('suggestionId') suggestionId: string,
    @Query('userId') userId: string,
    @Body() dto: AcceptSuggestionDto,
  ) {
    return this.aiService.acceptOrReject(suggestionId, userId, dto);
  }

  @Delete('ai/suggestions/:suggestionId')
  @ApiOperation({ summary: 'Supprimer une suggestion IA' })
  @ApiParam({ name: 'suggestionId' })
  async deleteSuggestion(
    @Param('suggestionId') suggestionId: string,
    @Query('userId') userId: string,
  ) {
    return this.aiService.deleteSuggestion(suggestionId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COVER GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  @Post('books/:bookId/covers/generate')
  @ApiOperation({
    summary: 'Générer une couverture IA pour un livre',
    description: 'Styles disponibles : vintage, moderne, minimaliste, aquarelle, africain, illustré',
  })
  @ApiParam({ name: 'bookId' })
  @ApiResponse({ status: 201, description: 'Couverture générée' })
  async generateCover(
    @Param('bookId') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: CreateCoverGenerationDto,
  ) {
    return this.aiService.generateCover(bookId, userId, dto);
  }

  @Get('books/:bookId/covers')
  @ApiOperation({ summary: 'Lister toutes les couvertures générées pour un livre' })
  @ApiParam({ name: 'bookId' })
  async getCoversForBook(
    @Param('bookId') bookId: string,
    @Query('userId') userId: string,
  ) {
    return this.aiService.getCoversForBook(bookId, userId);
  }

  @Patch('books/:bookId/covers/:coverId/select')
  @ApiOperation({
    summary: 'Sélectionner une couverture comme couverture officielle du livre',
    description: 'Désélectionne automatiquement les autres et met à jour coverImageUrl du livre',
  })
  @ApiParam({ name: 'bookId' })
  @ApiParam({ name: 'coverId' })
  async selectCover(
    @Param('bookId') bookId: string,
    @Param('coverId') coverId: string,
    @Query('userId') userId: string,
  ) {
    return this.aiService.selectCover(bookId, coverId, userId);
  }

  @Delete('books/:bookId/covers/:coverId')
  @ApiOperation({ summary: 'Supprimer une couverture générée' })
  @ApiParam({ name: 'bookId' })
  @ApiParam({ name: 'coverId' })
  async deleteCover(
    @Param('bookId') bookId: string,
    @Param('coverId') coverId: string,
    @Query('userId') userId: string,
  ) {
    return this.aiService.deleteCover(bookId, coverId, userId);
  }
}