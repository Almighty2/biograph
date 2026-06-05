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
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  MarkReadDto,
  NotificationFilterDto,
  NotificationType,
  CreateWritingReminderDto,
  UpdateWritingReminderDto,
} from './dto/notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════════════════

  @Post('system/create')
  @ApiOperation({
    summary: '[Système interne] Créer une notification',
    description:
      'Utilisé par les autres services (Order, Collaboration, AI...) pour notifier l\'utilisateur. Ne pas exposer publiquement.',
  })
  async create(@Body() dto: CreateNotificationDto) {
    return this.notificationService.create(dto);
  }

  @Get('mes-notifications')
  @ApiOperation({
    summary: 'Lister mes notifications avec filtres',
    description: 'Retourne aussi le compte des non-lues par type dans les métadonnées.',
  })
  @ApiQuery({ name: 'userId',  required: true })
  @ApiQuery({ name: 'type',    enum: NotificationType, required: false })
  @ApiQuery({ name: 'isRead',  type: Boolean, required: false })
  @ApiQuery({ name: 'page',    type: Number,  required: false })
  @ApiQuery({ name: 'limit',   type: Number,  required: false })
  async findAll(
    @Query('userId')  userId: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe)  page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe)  limit: number,
    @Query('type')    type?: NotificationType,
    @Query('isRead')  isRead?: string,
  ) {
    const filter: NotificationFilterDto = {
      type,
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
    };
    return this.notificationService.findAll(userId, filter, page, limit);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Compter les notifications non lues (total + détail par type)',
    description: 'Idéal pour afficher le badge de notifications dans l\'UI.',
  })
  @ApiQuery({ name: 'userId', required: true })
  async countUnread(@Query('userId') userId: string) {
    return this.notificationService.countUnread(userId);
  }

  @Patch('mark-read')
  @ApiOperation({ summary: 'Marquer des notifications spécifiques comme lues' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 200, description: 'Notifications marquées comme lues' })
  @ApiResponse({ status: 403, description: 'Une ou plusieurs notifications ne vous appartiennent pas' })
  async markAsRead(
    @Query('userId') userId: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.notificationService.markAsRead(userId, dto);
  }

  @Patch('mark-all-read')
  @ApiOperation({
    summary: 'Marquer toutes les notifications comme lues (filtre optionnel par type)',
  })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'type', enum: NotificationType, required: false })
  async markAllAsRead(
    @Query('userId') userId: string,
    @Query('type')   type?: NotificationType,
  ) {
    return this.notificationService.markAllAsRead(userId, type);
  }

  @Delete('read')
  @ApiOperation({ summary: 'Supprimer toutes les notifications déjà lues' })
  @ApiQuery({ name: 'userId', required: true })
  async removeAllRead(@Query('userId') userId: string) {
    return this.notificationService.removeAllRead(userId);
  }

  @Delete(':notificationId')
  @ApiOperation({ summary: 'Supprimer une notification' })
  @ApiParam({ name: 'notificationId' })
  @ApiQuery({ name: 'userId', required: true })
  async remove(
    @Param('notificationId') notificationId: string,
    @Query('userId') userId: string,
  ) {
    return this.notificationService.remove(notificationId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITING REMINDERS
  // ══════════════════════════════════════════════════════════════════════════

  @Post('reminders')
  @ApiOperation({
    summary: 'Créer un rappel d\'écriture',
    description: `
Fréquences disponibles : DAILY · EVERY_2_DAYS · WEEKLY
Heure au format HH:MM (ex: 09:00)
bookId optionnel — si absent, rappel global pour tous les livres en cours
    `,
  })
  @ApiQuery({ name: 'userId', required: true })
  async createReminder(
    @Query('userId') userId: string,
    @Body() dto: CreateWritingReminderDto,
  ) {
    return this.notificationService.createReminder(userId, dto);
  }

  @Get('reminders')
  @ApiOperation({ summary: 'Lister mes rappels d\'écriture (avec infos du livre associé)' })
  @ApiQuery({ name: 'userId', required: true })
  async findAllReminders(@Query('userId') userId: string) {
    return this.notificationService.findAllReminders(userId);
  }

  @Patch('reminders/:reminderId')
  @ApiOperation({ summary: 'Modifier un rappel (fréquence, heure, actif/inactif)' })
  @ApiParam({ name: 'reminderId' })
  @ApiQuery({ name: 'userId', required: true })
  async updateReminder(
    @Param('reminderId') reminderId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateWritingReminderDto,
  ) {
    return this.notificationService.updateReminder(reminderId, userId, dto);
  }

  @Patch('reminders/:reminderId/toggle')
  @ApiOperation({ summary: 'Activer / désactiver un rappel d\'écriture' })
  @ApiParam({ name: 'reminderId' })
  @ApiQuery({ name: 'userId', required: true })
  async toggleReminder(
    @Param('reminderId') reminderId: string,
    @Query('userId') userId: string,
  ) {
    return this.notificationService.toggleReminder(reminderId, userId);
  }

  @Delete('reminders/:reminderId')
  @ApiOperation({ summary: 'Supprimer un rappel d\'écriture' })
  @ApiParam({ name: 'reminderId' })
  @ApiQuery({ name: 'userId', required: true })
  async removeReminder(
    @Param('reminderId') reminderId: string,
    @Query('userId') userId: string,
  ) {
    return this.notificationService.removeReminder(reminderId, userId);
  }
}