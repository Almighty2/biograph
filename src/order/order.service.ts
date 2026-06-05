import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateOrderDto,
  ConfirmPaymentDto,
  UpdateOrderStatusDto,
  CancelOrderDto,
} from './dto/order.dto';
import {
  OrderStatus,
  PrintFormat,
  CoverType,
  PRICE_PER_PAGE,
  HARDCOVER_SURCHARGE,
  ALLOWED_TRANSITIONS,
} from './enums/order.enum';
import { PrismaService } from 'src/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/dto/notification.dto';

const ORDER_STATUS_TITLES: Record<string, string> = {
  CONFIRMED:  'Commande confirmée',
  PRINTING:   'Impression en cours',
  SHIPPED:    'Commande expédiée',
  DELIVERED:  'Commande livrée',
  CANCELLED:  'Commande annulée',
  REFUNDED:   'Remboursement effectué',
};

const ORDER_STATUS_BODIES: Record<string, (trackingCode?: string) => string> = {
  CONFIRMED:  () => 'Votre commande a été confirmée et sera bientôt envoyée à l\'impression.',
  PRINTING:   () => 'Votre livre est en cours d\'impression.',
  SHIPPED:    (code) => `Votre commande a été expédiée${code ? ` — code de suivi : ${code}` : ''}.`,
  DELIVERED:  () => 'Votre commande a été livrée. Bonne lecture !',
  CANCELLED:  () => 'Votre commande a été annulée.',
  REFUNDED:   () => 'Le remboursement de votre commande a été effectué.',
};

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // CRÉER UNE COMMANDE
  // ══════════════════════════════════════════════════════════════════════════

  async create(userId: string, dto: CreateOrderDto) {
    // Vérifier que le livre existe et appartient à l'utilisateur
    const book = await this.prisma.book.findFirst({
      where: { id: dto.bookId, ownerId: userId, deletedAt: null },
    });
    if (!book) throw new NotFoundException('Livre introuvable ou accès refusé');

    if (book.pageCount === 0) {
      throw new BadRequestException(
        'Le livre doit avoir au moins une page pour être commandé',
      );
    }

    // Calcul du prix côté serveur
    const format = dto.printFormat ?? PrintFormat.A5;
    const cover = dto.coverType ?? CoverType.PAPERBACK;
    const copies = dto.copies;
    const pageCount = book.pageCount;

    const pricePerPage = PRICE_PER_PAGE[format];
    const basePriceCents = pageCount * pricePerPage;
    const coverSurcharge = cover === CoverType.HARDCOVER ? HARDCOVER_SURCHARGE : 0;
    const unitPriceCents = basePriceCents + coverSurcharge;
    const totalCents = unitPriceCents * copies;

    const order = await this.prisma.order.create({
      data: {
        userId,
        bookId: dto.bookId,
        status: OrderStatus.PENDING,
        printFormat: format,
        coverType: cover,
        copies,
        pageCount,
        unitPriceCents,
        totalCents,
        currency: 'XOF',
        shippingAddress: dto.shippingAddress as any,
      },
      include: { events: true },
    });

    // Enregistrer l'événement initial
    await this.logEvent(order.id, OrderStatus.PENDING, 'Commande créée');

    // Notifier l'utilisateur
    this.notificationService.create({
      userId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Commande créée',
      body: `Votre commande pour "${book.title}" (${copies} exemplaire${copies > 1 ? 's' : ''}) a bien été enregistrée.`,
      data: { orderId: order.id, bookId: dto.bookId },
    }).catch(() => {});

    return {
      message: 'Commande créée avec succès',
      order,
      pricing: {
        pageCount,
        pricePerPage: `${pricePerPage} XOF`,
        coverSurcharge: `${coverSurcharge / 100} XOF`,
        unitPrice: `${unitPriceCents / 100} XOF`,
        total: `${totalCents / 100} XOF`,
        copies,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIMULER LE PRIX (avant de commander)
  // ══════════════════════════════════════════════════════════════════════════

  async simulatePrice(
    bookId: string,
    userId: string,
    printFormat: PrintFormat,
    coverType: CoverType,
    copies: number,
  ) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, ownerId: userId, deletedAt: null },
    });
    if (!book) throw new NotFoundException('Livre introuvable');

    const pageCount = book.pageCount || 1;
    const pricePerPage = PRICE_PER_PAGE[printFormat];
    const coverSurcharge = coverType === CoverType.HARDCOVER ? HARDCOVER_SURCHARGE : 0;
    const unitPriceCents = pageCount * pricePerPage + coverSurcharge;
    const totalCents = unitPriceCents * copies;

    return {
      bookTitle: book.title,
      pageCount,
      printFormat,
      coverType,
      copies,
      breakdown: {
        pricePerPage: `${pricePerPage} XOF`,
        basePrice: `${(pageCount * pricePerPage) / 100} XOF`,
        coverSurcharge: `${coverSurcharge / 100} XOF`,
        unitPrice: `${unitPriceCents / 100} XOF`,
        total: `${totalCents / 100} XOF`,
        currency: 'XOF',
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LISTER LES COMMANDES
  // ══════════════════════════════════════════════════════════════════════════

  async findAllForUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          book: { select: { id: true, title: true, coverImageUrl: true } },
          events: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllAdmin(page = 1, limit = 20, status?: OrderStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          book: { select: { id: true, title: true } },
          events: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉTAIL D'UNE COMMANDE
  // ══════════════════════════════════════════════════════════════════════════

  async findOne(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        book: { select: { id: true, title: true, coverImageUrl: true, pageCount: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) throw new NotFoundException('Commande introuvable');
    if (order.userId !== userId) throw new ForbiddenException('Accès refusé');

    return order;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIRMER LE PAIEMENT
  // ══════════════════════════════════════════════════════════════════════════

  async confirmPayment(orderId: string, userId: string, dto: ConfirmPaymentDto) {
    const order = await this.getOrderOrFail(orderId);
    if (order.userId !== userId) throw new ForbiddenException('Accès refusé');

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Seule une commande en attente peut être confirmée');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CONFIRMED,
        paymentGateway: dto.paymentGateway,
        paymentReference: dto.paymentReference,
        paidAt: new Date(),
      },
    });

    await this.logEvent(orderId, OrderStatus.CONFIRMED, `Paiement confirmé via ${dto.paymentGateway}`);

    return { message: 'Paiement confirmé, commande en cours de traitement', order: updated };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // METTRE À JOUR LE STATUT (admin)
  // ══════════════════════════════════════════════════════════════════════════

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.getOrderOrFail(orderId);
    // Vérifier la transition autorisée
    const allowed = ALLOWED_TRANSITIONS[order.status as OrderStatus];
    console.log(allowed);
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Transition invalide : ${order.status} → ${dto.status}. Transitions autorisées : ${allowed.join(', ') || 'aucune'}`,
      );
    }

    // Validation métier spécifique
    if (dto.status === OrderStatus.SHIPPED && !dto.trackingCode) {
      throw new BadRequestException('Le code de suivi est requis pour expédier une commande');
    }

    const data: any = { status: dto.status };

    if (dto.status === OrderStatus.SHIPPED) {
      data.trackingCode = dto.trackingCode;
      data.shippedAt = new Date();
    }
    if (dto.status === OrderStatus.DELIVERED) {
      data.deliveredAt = new Date();
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data,
    });

    await this.logEvent(orderId, dto.status, dto.note);

    // Notifier le propriétaire de la commande
    this.notificationService.create({
      userId: order.userId,
      type: NotificationType.ORDER_UPDATE,
      title: ORDER_STATUS_TITLES[dto.status] ?? 'Commande mise à jour',
      body: ORDER_STATUS_BODIES[dto.status]?.(dto.trackingCode) ?? `Votre commande est maintenant : ${dto.status}.`,
      data: { orderId, status: dto.status },
    }).catch(() => {});

    return { message: `Statut mis à jour : ${dto.status}`, order: updated };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ANNULER UNE COMMANDE
  // ══════════════════════════════════════════════════════════════════════════

  async cancel(orderId: string, userId: string, dto: CancelOrderDto) {
    const order = await this.getOrderOrFail(orderId);
    if (order.userId !== userId) throw new ForbiddenException('Accès refusé');

    const allowed = ALLOWED_TRANSITIONS[order.status as OrderStatus];
    if (!allowed.includes(OrderStatus.CANCELLED)) {
      throw new BadRequestException(
        `Une commande avec le statut "${order.status}" ne peut plus être annulée`,
      );
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    await this.logEvent(orderId, OrderStatus.CANCELLED, dto.reason ?? 'Annulée par l\'utilisateur');

    return { message: 'Commande annulée' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HISTORIQUE DES ÉVÉNEMENTS
  // ══════════════════════════════════════════════════════════════════════════

  async getEvents(orderId: string, userId: string) {
    const order = await this.getOrderOrFail(orderId);
    if (order.userId !== userId) throw new ForbiddenException('Accès refusé');

    const events = await this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return { data: events, total: events.length };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVÉS
  // ══════════════════════════════════════════════════════════════════════════

  private async getOrderOrFail(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Commande introuvable');
    return order;
  }

  private async logEvent(orderId: string, status: OrderStatus, note?: string) {
    await this.prisma.orderEvent.create({
      data: { orderId, status, note },
    });
  }
}