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
import { BlockchainService } from './blockchain.service';
import { CreateAnchorDto, ConfirmAnchorDto } from './dto/blockchain.dto';

@ApiTags('Blockchain')
@ApiBearerAuth()
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  // ─── Créer un ancrage ─────────────────────────────────────────────────────

  @Post('anchors')
  @ApiOperation({
    summary: 'Ancrer un ou plusieurs livres sur la blockchain',
    description: `
        Processus :
        1. Calcule un hash SHA256 du contenu de chaque livre (chapitres + sous-chapitres)
        2. Crée l'entrée BlockchainAnchor en base
        3. Soumet la transaction au réseau blockchain via un worker
        4. La confirmation (txHash) arrive ensuite via le webhook PATCH /anchors/:id/confirm

        Réseaux disponibles : polygon (défaut) · ethereum · bsc · tezos
    `,
  })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 201, description: 'Ancrage créé, soumission blockchain en attente' })
  @ApiResponse({ status: 404, description: 'Un ou plusieurs livres introuvables' })
  @ApiResponse({ status: 409, description: 'Livre déjà ancré ou contenu identique déjà ancré' })
  async create(
    @Query('userId') userId: string,
    @Body() dto: CreateAnchorDto,
  ) {
    return this.blockchainService.create(userId, dto);
  }

  // ─── Mes ancrages ─────────────────────────────────────────────────────────

  @Get('anchors')
  @ApiOperation({ summary: 'Lister mes ancrages blockchain' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.blockchainService.findAllForUser(userId, page, limit);
  }

  // ─── Détail d'un ancrage ──────────────────────────────────────────────────

  @Get('anchors/:anchorId')
  @ApiOperation({
    summary: 'Détail d\'un ancrage (avec lien explorateur blockchain si confirmé)',
  })
  @ApiParam({ name: 'anchorId' })
  @ApiQuery({ name: 'userId', required: true })
  async findOne(
    @Param('anchorId') anchorId: string,
    @Query('userId') userId: string,
  ) {
    return this.blockchainService.findOne(anchorId, userId);
  }

  // ─── Vérifier l'intégrité d'un livre ─────────────────────────────────────

  @Get('verify/:bookId')
  @ApiOperation({
    summary: 'Vérifier l\'intégrité d\'un livre par rapport à son ancrage',
    description: `
        Compare le hash SHA256 actuel du contenu du livre avec celui enregistré lors de l'ancrage.
        - isIntact: true → le contenu n'a pas été modifié depuis l'ancrage
        - isIntact: false → le contenu a été modifié après l'ancrage (alerte d'intégrité)
    `,
  })
  @ApiParam({ name: 'bookId', description: 'ID du livre à vérifier' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 200, description: 'Résultat de vérification d\'intégrité' })
  async verifyIntegrity(
    @Param('bookId') bookId: string,
    @Query('userId') userId: string,
  ) {
    return this.blockchainService.verifyIntegrity(bookId, userId);
  }

  // ─── Confirmer la transaction (webhook worker) ────────────────────────────

  @Patch('anchors/:anchorId/confirm')
  @ApiOperation({
    summary: '[Webhook interne] Confirmer la transaction blockchain après soumission on-chain',
    description:
      'Appelé par le worker blockchain une fois la transaction minée. Enregistre le txHash et la date d\'ancrage.',
  })
  @ApiParam({ name: 'anchorId' })
  @ApiResponse({ status: 200, description: 'Ancrage confirmé avec txHash' })
  @ApiResponse({ status: 409, description: 'Ancrage déjà confirmé' })
  async confirmTransaction(
    @Param('anchorId') anchorId: string,
    @Body() dto: ConfirmAnchorDto,
  ) {
    return this.blockchainService.confirmTransaction(anchorId, dto);
  }

  // ─── Détacher un livre d'un ancrage ──────────────────────────────────────

  @Delete('anchors/:anchorId/books/:bookId')
  @ApiOperation({
    summary: 'Détacher un livre d\'un ancrage non encore confirmé',
    description: 'Impossible si l\'ancrage est déjà confirmé on-chain (txHash présent).',
  })
  @ApiParam({ name: 'anchorId' })
  @ApiParam({ name: 'bookId' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiResponse({ status: 200, description: 'Livre détaché de l\'ancrage' })
  @ApiResponse({ status: 400, description: 'Ancrage déjà confirmé, détachement impossible' })
  async detachBook(
    @Param('anchorId') anchorId: string,
    @Param('bookId') bookId: string,
    @Query('userId') userId: string,
  ) {
    return this.blockchainService.detachBook(anchorId, bookId, userId);
  }
}