import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateNotificationDto,
  MarkReadDto,
  NotificationFilterDto,
  NotificationType,
  CreateWritingReminderDto,
  UpdateWritingReminderDto,
} from './dto/notification.dto';
import { PrismaService } from 'src/prisma.service';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationService {
  private transporter: nodemailer.Transporter;
  constructor(private readonly prisma: PrismaService, private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT'),
      secure: this.config.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════════════════

  // Créer une notification (usage interne — appelé par les autres services)
  async create(dto: CreateNotificationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const notification = await this.prisma.notification.create({
      data: {
        userId:  dto.userId,
        type:    dto.type,
        title:   dto.title,
        body:    dto.body,
        isRead:  false,
        data:    dto.data ?? {null: null},
      },
    });

    return notification;
  }

  // Lister les notifications d'un utilisateur avec filtres
  async findAll(
    userId: string,
    filter: NotificationFilterDto,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (filter.type !== undefined)   where.type   = filter.type;
    if (filter.isRead !== undefined) where.isRead = filter.isRead;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  // Compter les notifications non lues
  async countUnread(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    // Détail par type
    const byType = await this.prisma.notification.groupBy({
      by: ['type'],
      where: { userId, isRead: false },
      _count: { id: true },
    });

    return {
      total: count,
      byType: byType.reduce(
        (acc, item) => ({ ...acc, [item.type]: item._count.id }),
        {} as Record<string, number>,
      ),
    };
  }

  // Marquer des notifications spécifiques comme lues
  async markAsRead(userId: string, dto: MarkReadDto) {
    // S'assurer que toutes les notifications appartiennent à l'utilisateur
    const count = await this.prisma.notification.count({
      where: { id: { in: dto.ids }, userId },
    });

    if (count !== dto.ids.length) {
      throw new ForbiddenException(
        'Certaines notifications sont introuvables ou ne vous appartiennent pas',
      );
    }

    await this.prisma.notification.updateMany({
      where: { id: { in: dto.ids }, userId },
      data: { isRead: true },
    });

    return { message: `${dto.ids.length} notification(s) marquée(s) comme lue(s)` };
  }

  // Marquer TOUTES les notifications comme lues
  async markAllAsRead(userId: string, type?: NotificationType) {
    const where: any = { userId, isRead: false };
    if (type) where.type = type;

    const { count } = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    return { message: `${count} notification(s) marquée(s) comme lue(s)` };
  }

  // Supprimer une notification
  async remove(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) throw new NotFoundException('Notification introuvable');
    if (notification.userId !== userId) throw new ForbiddenException('Accès refusé');

    await this.prisma.notification.delete({ where: { id: notificationId } });

    return { message: 'Notification supprimée' };
  }

  // Supprimer toutes les notifications lues
  async removeAllRead(userId: string) {
    const { count } = await this.prisma.notification.deleteMany({
      where: { userId, isRead: true },
    });

    return { message: `${count} notification(s) supprimée(s)` };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITING REMINDERS
  // ══════════════════════════════════════════════════════════════════════════

  async createReminder(userId: string, dto: CreateWritingReminderDto) {
    // Vérifier que le livre appartient à l'utilisateur si bookId fourni
    if (dto.bookId) {
      const book = await this.prisma.book.findFirst({
        where: { id: dto.bookId, ownerId: userId, deletedAt: null },
      });
      if (!book) throw new NotFoundException('Livre introuvable ou accès refusé');
    }

    // Vérifier qu'il n'existe pas déjà un rappel pour ce livre
    const existing = await this.prisma.writingReminder.findFirst({
      where: { userId, bookId: dto.bookId ?? null },
    });

    if (existing) {
      throw new BadRequestException(
        dto.bookId
          ? 'Un rappel existe déjà pour ce livre. Utilisez PATCH pour le modifier.'
          : 'Un rappel global existe déjà. Utilisez PATCH pour le modifier.',
      );
    }

    const reminder = await this.prisma.writingReminder.create({
      data: {
        userId,
        bookId:    dto.bookId ?? null,
        frequency: dto.frequency ?? 'DAILY',
        time:      dto.time,
        isActive:  true,
      },
    });

    return { message: 'Rappel d\'écriture créé', reminder };
  }

  async findAllReminders(userId: string) {
    const reminders = await this.prisma.writingReminder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
    });

    // Jointure manuelle — bookId est un simple String, pas une relation Prisma
    const remindersWithBook = await Promise.all(
        reminders.map(async (reminder) => {
        if (!reminder.bookId) return { ...reminder, book: null };

        const book = await this.prisma.book.findUnique({
            where: { id: reminder.bookId },
            select: { id: true, title: true, coverImageUrl: true },
        });

        return { ...reminder, book };
        }),
    );

    return { data: remindersWithBook, total: remindersWithBook.length };
   }

  async updateReminder(
    reminderId: string,
    userId: string,
    dto: UpdateWritingReminderDto,
  ) {
    const reminder = await this.prisma.writingReminder.findFirst({
      where: { id: reminderId, userId },
    });
    if (!reminder) throw new NotFoundException('Rappel introuvable');

    const updated = await this.prisma.writingReminder.update({
      where: { id: reminderId },
      data: dto,
    });

    return { message: 'Rappel mis à jour', reminder: updated };
  }

  async toggleReminder(reminderId: string, userId: string) {
    const reminder = await this.prisma.writingReminder.findFirst({
      where: { id: reminderId, userId },
    });
    if (!reminder) throw new NotFoundException('Rappel introuvable');

    const updated = await this.prisma.writingReminder.update({
      where: { id: reminderId },
      data: { isActive: !reminder.isActive },
    });

    return {
      message: updated.isActive ? 'Rappel activé' : 'Rappel désactivé',
      reminder: updated,
    };
  }

  async removeReminder(reminderId: string, userId: string) {
    const reminder = await this.prisma.writingReminder.findFirst({
      where: { id: reminderId, userId },
    });
    if (!reminder) throw new NotFoundException('Rappel introuvable');

    await this.prisma.writingReminder.delete({ where: { id: reminderId } });

    return { message: 'Rappel supprimé' };
  }

    async sendMail(to: string, subject: string, html: string, bccList: string[] = []) {
    const from = `"${this.config.get('MAIL_FROM_NAME')}" <${this.config.get('MAIL_USER')}>`;
    const bcc = bccList.filter((mail) => mail && mail !== to);

    try {
      const info = await this.transporter.sendMail({ from, to, subject, html, bcc });
      console.log('Mail envoyé :', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error("Erreur d'envoi :", error);
      return { success: false, error: error.message };
    }
  }
}