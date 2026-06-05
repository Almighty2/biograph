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
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CreateMediaProjectDto, UpdateMediaProjectDto } from './dto/media-project.dto';

@ApiTags('Media Projects')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // ─── Créer un projet multimédia ───────────────────────────────────────────

  @Post('books/:bookId/media')
  @ApiOperation({
    summary: 'Créer un projet audio ou vidéo pour un livre',
    description: `
Types disponibles :
- AUDIO_NARRATION → narration audio du livre avec voix de synthèse
- VIDEO_STORY → vidéo narrative générée depuis le contenu du livre
    `,
  })
  @ApiParam({ name: 'bookId' })
  @ApiResponse({ status: 201, description: 'Projet créé, génération en file d\'attente' })
  async create(
    @Param('bookId') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: CreateMediaProjectDto,
  ) {
    return this.mediaService.create(bookId, userId, dto);
  }

  // ─── Lister les projets d'un livre ───────────────────────────────────────

  @Get('books/:bookId/media')
  @ApiOperation({ summary: 'Lister tous les projets multimédia d\'un livre' })
  @ApiParam({ name: 'bookId' })
  async findAllForBook(
    @Param('bookId') bookId: string,
    @Query('userId') userId: string,
  ) {
    return this.mediaService.findAllForBook(bookId, userId);
  }

  // ─── Lister les projets de l'utilisateur ─────────────────────────────────

  @Get('media/my-projects')
  @ApiOperation({ summary: 'Lister tous mes projets multimédia (tous livres confondus)' })
  @ApiQuery({ name: 'userId', required: true })
  async findAllForUser(@Query('userId') userId: string) {
    return this.mediaService.findAllForUser(userId);
  }

  // ─── Détail d'un projet ───────────────────────────────────────────────────

  @Get('media/:projectId')
  @ApiOperation({ summary: 'Détail d\'un projet multimédia (avec statut et fileUrl)' })
  @ApiParam({ name: 'projectId' })
  async findOne(
    @Param('projectId') projectId: string,
    @Query('userId') userId: string,
  ) {
    return this.mediaService.findOne(projectId, userId);
  }

  // ─── Mettre à jour un projet ──────────────────────────────────────────────

  @Patch('media/:projectId')
  @ApiOperation({ summary: 'Modifier un projet multimédia (titre, voix, musique)' })
  @ApiParam({ name: 'projectId' })
  async update(
    @Param('projectId') projectId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateMediaProjectDto,
  ) {
    return this.mediaService.update(projectId, userId, dto);
  }

  // ─── Relancer la génération ───────────────────────────────────────────────

  @Post('media/:projectId/regenerate')
  @ApiOperation({
    summary: 'Relancer la génération d\'un projet (en cas d\'échec ou modification)',
  })
  @ApiParam({ name: 'projectId' })
  async regenerate(
    @Param('projectId') projectId: string,
    @Query('userId') userId: string,
    @Body()             dto?: UpdateMediaProjectDto,
  ) {
    return this.mediaService.regenerate(projectId, userId, dto);
  }

  // ─── Supprimer un projet ──────────────────────────────────────────────────

  @Delete('media/:projectId')
  @ApiOperation({ summary: 'Supprimer un projet multimédia' })
  @ApiParam({ name: 'projectId' })
  async remove(
    @Param('projectId') projectId: string,
    @Query('userId') userId: string,
  ) {
    return this.mediaService.remove(projectId, userId);
  }

  // ─── Webhook worker ───────────────────────────────────────────────────────

  @Patch('media/:projectId/status')
  @ApiOperation({
    summary: '[Webhook interne] Mettre à jour le statut après génération par le worker',
    description: 'Appelé par le worker BullMQ une fois la génération terminée ou échouée',
  })
  @ApiParam({ name: 'projectId' })
  async updateStatus(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      status: 'DONE' | 'FAILED';
      fileUrl?: string;
      durationSec?: number;
      error?: string;
    },
  ) {
    return this.mediaService.updateStatus(
      projectId,
      body.status,
      body.fileUrl,
      body.durationSec,
      body.error,
    );
  }
}