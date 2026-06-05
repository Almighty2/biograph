import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  CreateThreadDto,
  UpdateThreadStatusDto,
  SendMessageDto,
  SupportStatus,
  SenderType,
  SUPPORT_TRANSITIONS,
} from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // THREADS
  // ══════════════════════════════════════════════════════════════════════════

  async createThread(userId: string, dto: CreateThreadDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    // Créer le thread ET le premier message dans une transaction
    const thread = await this.prisma.$transaction(async (tx) => {
      const newThread = await tx.supportThread.create({
        data: {
          userId,
          subject: dto.subject,
          status:  SupportStatus.OPEN,
        },
      });

      await tx.supportMessage.create({
        data: {
          threadId:   newThread.id,
          senderType: SenderType.USER,
          senderId:   userId,
          content:    dto.message,
        },
      });

      return newThread;
    });

    const fullThread = await this.findThreadById(thread.id);

    return { message: 'Discussion de support créée', thread: fullThread };
  }

  async findAllForUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [threads, total] = await Promise.all([
      this.prisma.supportThread.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1, // dernier message pour prévisualisation
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportThread.count({ where: { userId } }),
    ]);

    return {
      data: threads,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllAdmin(
    page = 1,
    limit = 20,
    status?: SupportStatus,
  ) {
    const skip  = (page - 1) * limit;
    const where = status ? { status } : {};

    const [threads, total] = await Promise.all([
      this.prisma.supportThread.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportThread.count({ where }),
    ]);

    return {
      data: threads,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneThread(threadId: string, userId: string, isAdmin = false) {
    const thread = await this.findThreadById(threadId);

    if (!isAdmin && thread.userId !== userId) {
      throw new ForbiddenException('Accès refusé à cette discussion');
    }

    return thread;
  }

  async updateThreadStatus(
    threadId: string,
    dto: UpdateThreadStatusDto,
  ) {
    const thread = await this.getThreadOrFail(threadId);

    const allowed = SUPPORT_TRANSITIONS[thread.status as SupportStatus];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Transition invalide : ${thread.status} → ${dto.status}. Autorisées : ${allowed.join(', ')}`,
      );
    }

    const data: any = { status: dto.status };

    if (dto.status === SupportStatus.CLOSED) {
      data.closedAt = new Date();
    }

    // Rouvrir un thread remet closedAt à null
    if (dto.status === SupportStatus.OPEN) {
      data.closedAt = null;
    }

    const updated = await this.prisma.supportThread.update({
      where: { id: threadId },
      data,
    });

    // Ajouter un message système si note fournie
    if (dto.note) {
      await this.prisma.supportMessage.create({
        data: {
          threadId,
          senderType: SenderType.BOT,
          senderId:   null,
          content:    `[Statut → ${dto.status}] ${dto.note}`,
        },
      });
    }

    return { message: `Statut mis à jour : ${dto.status}`, thread: updated };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGES
  // ══════════════════════════════════════════════════════════════════════════

  async getMessages(threadId: string, userId: string, isAdmin = false, page = 1, limit = 50) {
    const thread = await this.getThreadOrFail(threadId);

    if (!isAdmin && thread.userId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.supportMessage.findMany({
        where: { threadId },
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.supportMessage.count({ where: { threadId } }),
    ]);

    return {
      data: messages,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async sendMessage(threadId: string, userId: string, dto: SendMessageDto, isAdmin = false) {
    const thread = await this.getThreadOrFail(threadId);

    // Vérifier l'accès selon le type d'expéditeur
    if (!isAdmin && thread.userId !== userId) {
      throw new ForbiddenException('Accès refusé à cette discussion');
    }

    // Empêcher d'envoyer un message dans un thread fermé (sauf admin)
    if (thread.status === SupportStatus.CLOSED && !isAdmin) {
      throw new BadRequestException(
        'Cette discussion est fermée. Ouvrez une nouvelle discussion.',
      );
    }

    const senderType = dto.senderType ?? SenderType.USER;
    const senderId   = senderType === SenderType.BOT ? null : (dto.senderId ?? userId);

    const message = await this.prisma.supportMessage.create({
      data: {
        threadId,
        senderType,
        senderId,
        content: dto.content,
      },
    });

    // Si l'agent répond → passer automatiquement en IN_PROGRESS
    if (
      senderType === SenderType.AGENT &&
      thread.status === SupportStatus.OPEN
    ) {
      await this.prisma.supportThread.update({
        where: { id: threadId },
        data:  { status: SupportStatus.IN_PROGRESS },
      });
    }

    return { message: 'Message envoyé', data: message };
  }

  async deleteMessage(threadId: string, messageId: string, userId: string) {
    const thread  = await this.getThreadOrFail(threadId);
    if (thread.userId !== userId) throw new ForbiddenException('Accès refusé');

    const msg = await this.prisma.supportMessage.findFirst({
      where: { id: messageId, threadId },
    });
    if (!msg) throw new NotFoundException('Message introuvable');

    // Seul l'auteur peut supprimer son propre message
    if (msg.senderId !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres messages');
    }

    await this.prisma.supportMessage.delete({ where: { id: messageId } });

    return { message: 'Message supprimé' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVÉS
  // ══════════════════════════════════════════════════════════════════════════

  private async getThreadOrFail(threadId: string) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) throw new NotFoundException('Discussion introuvable');
    return thread;
  }

  private async findThreadById(threadId: string) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id: threadId },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    if (!thread) throw new NotFoundException('Discussion introuvable');
    return thread;
  }
}