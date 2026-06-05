import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SupportService } from './support.service';
import {
  CreateThreadDto,
  UpdateThreadStatusDto,
  SendMessageDto,
  SupportStatus,
} from './dto/support.dto';

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // THREADS — UTILISATEUR
  // ══════════════════════════════════════════════════════════════════════════

  @Post('threads')
  @ApiOperation({
    summary: 'Ouvrir une nouvelle discussion de support',
    description: 'Crée le thread ET envoie le premier message en une seule requête.',
  })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 201, description: 'Discussion créée avec le premier message' })
  async createThread(
    @Query('userId') userId: string,
    @Body() dto: CreateThreadDto,
  ) {
    return this.supportService.createThread(userId, dto);
  }

  @Get('threads')
  @ApiOperation({ summary: 'Lister mes discussions de support' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  async findAll(
    @Query('userId') userId: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.supportService.findAllForUser(userId, page, limit);
  }

  @Get('threads/:threadId')
  @ApiOperation({ summary: 'Détail d\'une discussion (avec tous les messages)' })
  @ApiParam({ name: 'threadId' })
  @ApiQuery({ name: 'userId', required: true })
  async findOne(
    @Param('threadId') threadId: string,
    @Query('userId')   userId: string,
  ) {
    return this.supportService.findOneThread(threadId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THREADS — ADMIN
  // ══════════════════════════════════════════════════════════════════════════

  @Get('admin/threads')
  @ApiOperation({ summary: '[Admin] Lister toutes les discussions avec filtre par statut' })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'status', enum: SupportStatus, required: false })
  async findAllAdmin(
    @Query('page',   new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit',  new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: SupportStatus,
  ) {
    return this.supportService.findAllAdmin(page, limit, status);
  }

  @Get('admin/threads/:threadId')
  @ApiOperation({ summary: '[Admin] Détail complet d\'une discussion' })
  @ApiParam({ name: 'threadId' })
  async findOneAdmin(@Param('threadId') threadId: string) {
    return this.supportService.findOneThread(threadId, '', true);
  }

  @Patch('admin/threads/:threadId/status')
  @ApiOperation({
    summary: '[Admin] Changer le statut d\'une discussion',
    description: `
                Cycle autorisé :
                OPEN → IN_PROGRESS → RESOLVED → CLOSED
                RESOLVED ou CLOSED → OPEN (réouverture)

                Si une note est fournie, un message système est automatiquement ajouté au thread.
    `,
  })
  @ApiParam({ name: 'threadId' })
  @ApiQuery({ name: 'agentId', required: true })
  @ApiResponse({ status: 400, description: 'Transition de statut invalide' })
  async updateStatus(
    @Param('threadId') threadId: string,
    @Body() dto: UpdateThreadStatusDto,
  ) {
    return this.supportService.updateThreadStatus(threadId, dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGES
  // ══════════════════════════════════════════════════════════════════════════

  @Get('threads/:threadId/messages')
  @ApiOperation({ summary: 'Lister les messages d\'une discussion (paginé)' })
  @ApiParam({ name: 'threadId' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number, example: 50 })
  async getMessages(
    @Param('threadId') threadId: string,
    @Query('userId')   userId: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.supportService.getMessages(threadId, userId, false, page, limit);
  }

  @Post('threads/:threadId/messages')
  @ApiOperation({
    summary: 'Envoyer un message dans une discussion',
    description: `
            - Utilisateur → senderType: USER (par défaut)
            - Agent support → senderType: AGENT
            - Bot → senderType: BOT (senderId = null)

            Si un agent répond à un thread OPEN, le statut passe automatiquement à IN_PROGRESS.
            Impossible d'envoyer dans un thread CLOSED (sauf admin).
    `,
  })
  @ApiParam({ name: 'threadId' })
  @ApiQuery({ name: 'userId', required: true })
  async sendMessage(
    @Param('threadId') threadId: string,
    @Query('userId')   userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.supportService.sendMessage(threadId, userId, dto);
  }

  @Post('admin/threads/:threadId/messages')
  @ApiOperation({ summary: '[Admin] Envoyer un message en tant qu\'agent ou bot' })
  @ApiParam({ name: 'threadId' })
  @ApiQuery({ name: 'agentId', required: true })
  async sendMessageAdmin(
    @Param('threadId') threadId: string,
    @Query('agentId') agentId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.supportService.sendMessage(threadId, agentId, dto, true);
  }

  @Delete('threads/:threadId/messages/:messageId')
  @ApiOperation({ summary: 'Supprimer son propre message' })
  @ApiParam({ name: 'threadId' })
  @ApiParam({ name: 'messageId' })
  @ApiQuery({ name: 'userId', required: true })
  async deleteMessage(
    @Param('threadId')  threadId: string,
    @Param('messageId') messageId: string,
    @Query('userId')    userId: string,
  ) {
    return this.supportService.deleteMessage(threadId, messageId, userId);
  }
}