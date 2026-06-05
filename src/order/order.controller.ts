import {
  Body,
  Controller,
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
import { OrderService } from './order.service';
import {
  CreateOrderDto,
  ConfirmPaymentDto,
  UpdateOrderStatusDto,
  CancelOrderDto,
} from './dto/order.dto';
import { OrderStatus, PrintFormat, CoverType } from './enums/order.enum';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // ─── Simuler le prix AVANT de commander ───────────────────────────────────

  @Get('simulate-price')
  @ApiOperation({
    summary: 'Simuler le prix d\'une commande avant de la passer',
    description: 'Calcule le prix en fonction du format, type de couverture et nombre d\'exemplaires',
  })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'bookId', required: true })
  @ApiQuery({ name: 'printFormat', enum: PrintFormat, required: false })
  @ApiQuery({ name: 'coverType', enum: CoverType, required: false })
  @ApiQuery({ name: 'copies', type: Number, required: false, example: 1 })
  async simulatePrice(
    @Query('userId') userId: string,
    @Query('bookId') bookId: string,
    @Query('printFormat') printFormat: PrintFormat = PrintFormat.A5,
    @Query('coverType') coverType: CoverType = CoverType.PAPERBACK,
    @Query('copies', new DefaultValuePipe(1), ParseIntPipe) copies: number,
  ) {
    return this.orderService.simulatePrice(bookId, userId, printFormat, coverType, copies);
  }

  // ─── Créer une commande ────────────────────────────────────────────────────

  @Post('create')
  @ApiOperation({
    summary: 'Passer une commande d\'impression',
    description: `
        Le prix est calculé automatiquement côté serveur.
        Grille tarifaire :
        - A4 : 25 XOF/page · A5 : 18 XOF/page · POCKET : 15 XOF/page · SQUARE : 22 XOF/page
        - Supplément couverture rigide (HARDCOVER) : +1 500 XOF
            `,
  })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 201, description: 'Commande créée, en attente de paiement' })
  @ApiResponse({ status: 400, description: 'Livre sans pages ou données invalides' })
  @ApiResponse({ status: 404, description: 'Livre introuvable' })
  async create(
    @Query('userId') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.create(userId, dto);
  }

  // ─── Mes commandes (utilisateur) ──────────────────────────────────────────

  @Get('my-orders')
  @ApiOperation({ summary: 'Lister mes commandes (historique complet)' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllForUser(
    @Query('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.orderService.findAllForUser(userId, page, limit);
  }

  // ─── Toutes les commandes (admin) ─────────────────────────────────────────

  @Get('admin/all')
  @ApiOperation({ summary: '[Admin] Lister toutes les commandes avec filtre par statut' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  async findAllAdmin(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    return this.orderService.findAllAdmin(page, limit, status);
  }

  // ─── Détail d'une commande ─────────────────────────────────────────────────

  @Get(':orderId')
  @ApiOperation({ summary: 'Détail d\'une commande avec historique des événements' })
  @ApiParam({ name: 'orderId' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 200, description: 'Commande trouvée' })
  @ApiResponse({ status: 404, description: 'Commande introuvable' })
  async findOne(
    @Param('orderId') orderId: string,
    @Query('userId') userId: string,
  ) {
    return this.orderService.findOne(orderId, userId);
  }

  // ─── Confirmer le paiement ─────────────────────────────────────────────────

  @Post(':orderId/confirm-payment')
  @ApiOperation({
    summary: 'Confirmer le paiement d\'une commande',
    description: 'Passerelles disponibles : STRIPE · FLUTTERWAVE · MOBILE_MONEY',
  })
  @ApiParam({ name: 'orderId' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 200, description: 'Paiement confirmé, statut → CONFIRMED' })
  @ApiResponse({ status: 400, description: 'Commande déjà confirmée ou annulée' })
  async confirmPayment(
    @Param('orderId') orderId: string,
    @Query('userId') userId: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.orderService.confirmPayment(orderId, userId, dto);
  }

  // ─── Mettre à jour le statut (admin) ──────────────────────────────────────

  @Patch(':orderId/status')
  @ApiOperation({
    summary: '[Admin] Mettre à jour le statut d\'une commande',
    description: `
Cycle de vie autorisé :
PENDING → CONFIRMED → PRINTING → SHIPPED → DELIVERED
PENDING ou CONFIRMED → CANCELLED
DELIVERED → REFUNDED

Le code de suivi est obligatoire pour passer au statut SHIPPED.
    `,
  })
  @ApiParam({ name: 'orderId' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 400, description: 'Transition de statut invalide' })
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatus(orderId, dto);
  }

  // ─── Annuler une commande ──────────────────────────────────────────────────

  @Patch(':orderId/cancel')
  @ApiOperation({
    summary: 'Annuler une commande (possible uniquement en statut PENDING ou CONFIRMED)',
  })
  @ApiParam({ name: 'orderId' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 200, description: 'Commande annulée' })
  @ApiResponse({ status: 400, description: 'Commande non annulable dans cet état' })
  async cancel(
    @Param('orderId') orderId: string,
    @Query('userId') userId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancel(orderId, userId, dto);
  }

  // ─── Historique des événements ─────────────────────────────────────────────

  @Get(':orderId/events')
  @ApiOperation({ summary: 'Historique complet des événements d\'une commande' })
  @ApiParam({ name: 'orderId' })
  @ApiQuery({ name: 'userId', required: true })
  async getEvents(
    @Param('orderId') orderId: string,
    @Query('userId') userId: string,
  ) {
    return this.orderService.getEvents(orderId, userId);
  }
}