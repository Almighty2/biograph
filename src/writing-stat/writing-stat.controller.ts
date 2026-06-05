import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WritingStatService } from './writing-stat.service';
import { UpsertWritingStatDto, StatFilterDto } from './dto/writing-stat.dto';

@ApiTags('Writing Stats')
@ApiBearerAuth()
@Controller('writing-stats')
export class WritingStatController {
  constructor(private readonly writingStatService: WritingStatService) {}

  // ─── Enregistrer une session d'écriture ───────────────────────────────────

  @Post('upsert')
  @ApiOperation({
    summary: 'Enregistrer une session d\'écriture (upsert par jour)',
    description: `
            Une seule entrée par utilisateur + livre + jour.
            Si une entrée existe déjà pour ce jour, les mots et minutes sont additionnés.
            Date par défaut : aujourd'hui.
    `,
  })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 201, description: 'Session enregistrée' })
  async upsert(
    @Query('userId') userId: string,
    @Body() dto: UpsertWritingStatDto,
  ) {
    return this.writingStatService.upsert(userId, dto);
  }

  // ─── Résumé global ────────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({
    summary: 'Résumé des statistiques d\'écriture',
    description: `
            Retourne :
            - Total mots écrits, minutes passées, jours actifs
            - Moyenne mots/jour et minutes/jour
            - Meilleur jour (plus de mots écrits)
            - Streak actuel (jours consécutifs d'écriture)
    `,
  })
  @ApiQuery({ name: 'userId',  required: true })
  @ApiQuery({ name: 'bookId',  required: false })
  @ApiQuery({ name: 'from',    required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to',      required: false, description: 'YYYY-MM-DD' })
  async getSummary(
    @Query('userId') userId: string,
    @Query('bookId') bookId?: string,
    @Query('from')   from?: string,
    @Query('to')     to?: string,
  ) {
    return this.writingStatService.getSummary(userId, { bookId, from, to });
  }

  // ─── Données journalières (graphique) ─────────────────────────────────────

  @Get('daily')
  @ApiOperation({
    summary: 'Statistiques jour par jour (pour graphique barres / courbe)',
    description: 'Retourne une entrée par jour avec mots écrits et minutes passées.',
  })
  @ApiQuery({ name: 'userId',  required: true })
  @ApiQuery({ name: 'bookId',  required: false })
  @ApiQuery({ name: 'from',    required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to',      required: false, description: 'YYYY-MM-DD' })
  async getDaily(
    @Query('userId') userId: string,
    @Query('bookId') bookId?: string,
    @Query('from')   from?: string,
    @Query('to')     to?: string,
  ) {
    return this.writingStatService.getDaily(userId, { bookId, from, to });
  }

  // ─── Statistiques par livre ───────────────────────────────────────────────

  @Get('by-book')
  @ApiOperation({
    summary: 'Statistiques agrégées par livre',
    description: `
            Retourne pour chaque livre :
            - Total mots écrits et heures passées
            - Nombre de jours actifs
            - Moyenne mots par jour
    `,
  })
  @ApiQuery({ name: 'userId', required: true })
  async getByBook(@Query('userId') userId: string) {
    return this.writingStatService.getByBook(userId);
  }

  // ─── Streak actuel ────────────────────────────────────────────────────────

  @Get('streak')
  @ApiOperation({
    summary: 'Calculer le streak d\'écriture actuel (jours consécutifs)',
    description: 'Compte les jours consécutifs où l\'utilisateur a écrit au moins 1 mot.',
  })
  @ApiQuery({ name: 'userId',  required: true })
  @ApiQuery({ name: 'bookId',  required: false, description: 'Streak spécifique à un livre' })
  async getStreak(
    @Query('userId') userId: string,
    @Query('bookId') bookId?: string,
  ) {
    return this.writingStatService.getStreak(userId, bookId);
  }

  // ─── Supprimer une entrée ─────────────────────────────────────────────────

  @Delete(':statId')
  @ApiOperation({ summary: 'Supprimer une entrée de statistique' })
  @ApiParam({ name: 'statId' })
  @ApiQuery({ name: 'userId', required: true })
  async remove(
    @Param('statId') statId: string,
    @Query('userId') userId: string,
  ) {
    return this.writingStatService.remove(statId, userId);
  }
}