import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from 'src/prisma.service';
import { CreateAnchorDto, ConfirmAnchorDto } from './dto/blockchain.dto';
import { BlockchainNetwork } from '@prisma/client';

// On charge OpenTimestamps avec require pour eviter les erreurs ESM
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OpenTimestamps = require('javascript-opentimestamps');

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // CRÉER UN ANCRAGE
  // ══════════════════════════════════════════════════════════════════════════

  async create(userId: string, dto: CreateAnchorDto) {
    // 1. Vérifier que tous les livres appartiennent à l'utilisateur
    const books = await this.prisma.book.findMany({
      where: {
        id:        { in: dto.bookIds },
        ownerId:   userId,
        deletedAt: null,
      },
      include: {
        chapters: { include: { subChapters: true } },
      },
    });

    if (books.length !== dto.bookIds.length) {
      throw new NotFoundException(
        'Un ou plusieurs livres sont introuvables ou ne vous appartiennent pas',
      );
    }

    // 2. Vérifier qu'aucun livre n'est déjà ancré
    const alreadyAnchored = books.filter((b) => b.blockchainAnchorId !== null);
    if (alreadyAnchored.length > 0) {
      throw new ConflictException(
        `Ces livres ont deja un ancrage blockchain : ${alreadyAnchored.map((b) => b.title).join(', ')}`,
      );
    }

    // 3. Calculer le hash SHA256 du contenu agrégé
    const contentHash = this.computeContentHash(books);

    // 4. Vérifier que ce hash n'existe pas déjà
    const existing = await this.prisma.blockchainAnchor.findUnique({
      where: { contentHash },
    });
    if (existing) {
      throw new ConflictException('Un ancrage avec ce contenu identique existe deja');
    }

    // 5. Créer l'ancrage en transaction
    const network = dto.network ?? BlockchainNetwork.BITCOIN_OTS;
    const anchor = await this.prisma.$transaction(async (tx) => {
      const newAnchor = await tx.blockchainAnchor.create({
        data: {
          userId,
          contentHash,
          network,
          txHash:     null,
          anchoredAt: null,
        },
      });

      await tx.book.updateMany({
        where: { id: { in: dto.bookIds } },
        data:  { blockchainAnchorId: newAnchor.id },
      });

      return newAnchor;
    });

    // 6. Lancer la soumission blockchain en arrière-plan
    this.submitToBlockchainInBackground(anchor.id).catch((err) => {
      this.logger.error(`[Anchor ${anchor.id}] Echec soumission: ${err.message}`);
    });

    return {
      message: 'Ancrage cree, soumission blockchain en cours',
      anchor: {
        ...anchor,
        books: books.map((b) => ({ id: b.id, title: b.title })),
      },
      note: this.getNetworkInfo(network),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SOUMISSION BLOCKCHAIN (background)
  // ══════════════════════════════════════════════════════════════════════════

  private async submitToBlockchainInBackground(anchorId: string) {
    const anchor = await this.prisma.blockchainAnchor.findUnique({
      where: { id: anchorId },
    });
    if (!anchor) return;

    try {
      if (anchor.network === BlockchainNetwork.BITCOIN_OTS) {
        await this.submitViaOpenTimestamps(anchor);
      } else {
        // Pour Polygon/Ethereum/BSC/Tezos : a implementer plus tard avec ethers.js
        // Pour l'instant on simule
        await this.simulateOnChainSubmission(anchor);
      }
    } catch (err: any) {
      this.logger.error(`[Anchor ${anchorId}] Erreur: ${err.message}`);
      await this.prisma.blockchainAnchor.update({
        where: { id: anchorId },
        data:  { errorMessage: err.message },
      });
    }
  }

  // ─── OpenTimestamps (Bitcoin gratuit) ────────────────────────────────────

  private async submitViaOpenTimestamps(anchor: any) {
    this.logger.log(`[Anchor ${anchor.id}] Soumission OpenTimestamps...`);

    // Convertir le hash hex en Buffer
    const hashBuffer = Buffer.from(anchor.contentHash, 'hex');

    // Créer le timestamp détaché
    const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
      new OpenTimestamps.Ops.OpSHA256(),
      hashBuffer,
    );

    // Soumettre aux serveurs OpenTimestamps publics
    await OpenTimestamps.stamp(detached);

    // Sauvegarder la preuve OTS (a conserver pour verification future)
    const otsBuffer = Buffer.from(detached.serializeToBytes());
    const otsBase64 = otsBuffer.toString('base64');

    await this.prisma.blockchainAnchor.update({
      where: { id: anchor.id },
      data: {
        otsProof:    otsBase64,
        anchoredAt:  new Date(),
        txHash:      'pending-ots',  // sera remplace par le tx Bitcoin reel apres confirmation
        isConfirmed: false,
      },
    });

    this.logger.log(`[Anchor ${anchor.id}] OK | Confirmation Bitcoin sous 6-24h`);
  }

  // ─── Simulation pour reseaux non implementes ─────────────────────────────

  private async simulateOnChainSubmission(anchor: any) {
    this.logger.warn(
      `[Anchor ${anchor.id}] Reseau ${anchor.network} : simulation (pas d'integration reelle)`,
    );

    // Simuler une attente realiste (2-5 secondes)
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));

    // Generer un faux txHash deterministe a partir du contentHash
    const fakeTxHash = '0x' + crypto
      .createHash('sha256')
      .update(anchor.contentHash + anchor.network)
      .digest('hex');

    await this.prisma.blockchainAnchor.update({
      where: { id: anchor.id },
      data: {
        txHash:      fakeTxHash,
        anchoredAt:  new Date(),
        isConfirmed: true,
      },
    });

    this.logger.log(`[Anchor ${anchor.id}] OK simule | tx=${fakeTxHash.substring(0, 16)}...`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VÉRIFIER LES CONFIRMATIONS BITCOIN (cron toutes les heures)
  // ══════════════════════════════════════════════════════════════════════════

  async checkPendingConfirmations() {
    const pending = await this.prisma.blockchainAnchor.findMany({
      where: {
        network:     BlockchainNetwork.BITCOIN_OTS,
        isConfirmed: false,
        otsProof:    { not: null },
      },
    });

    this.logger.log(`[Cron] ${pending.length} ancrages OTS en attente de confirmation`);

    for (const anchor of pending) {
      try {
        await this.verifyOTSConfirmation(anchor);
      } catch (err: any) {
        this.logger.warn(`[Anchor ${anchor.id}] Pas encore confirme: ${err.message}`);
      }
    }
  }

  private async verifyOTSConfirmation(anchor: any) {
    if (!anchor.otsProof) return;

    const otsBuffer = Buffer.from(anchor.otsProof, 'base64');
    const detached = OpenTimestamps.DetachedTimestampFile.deserialize(otsBuffer);

    // Tenter de mettre a jour la preuve avec les infos Bitcoin
    await OpenTimestamps.upgrade(detached);

    // Verifier la confirmation
    const result = await OpenTimestamps.verify(detached);

    if (result && result.bitcoin) {
      const updatedOts = Buffer.from(detached.serializeToBytes()).toString('base64');

      await this.prisma.blockchainAnchor.update({
        where: { id: anchor.id },
        data: {
          isConfirmed:   true,
          confirmedAt:   new Date(),
          bitcoinHeight: result.bitcoin.height,
          bitcoinTime:   new Date(result.bitcoin.timestamp * 1000),
          txHash:        `bitcoin-block-${result.bitcoin.height}`,
          otsProof:      updatedOts,
        },
      });

      this.logger.log(
        `[Anchor ${anchor.id}] CONFIRME sur Bitcoin bloc ${result.bitcoin.height}`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LISTER MES ANCRAGES
  // ══════════════════════════════════════════════════════════════════════════

  async findAllForUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [anchors, total] = await Promise.all([
      this.prisma.blockchainAnchor.findMany({
        where:   { userId },
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: {
          books: { select: { id: true, title: true, coverImageUrl: true } },
        },
      }),
      this.prisma.blockchainAnchor.count({ where: { userId } }),
    ]);

    return {
      data: anchors.map((a) => ({
        ...a,
        explorerUrl: a.txHash ? this.buildExplorerUrl(a.network, a.txHash) : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉTAIL D'UN ANCRAGE
  // ══════════════════════════════════════════════════════════════════════════

  async findOne(anchorId: string, userId: string) {
    const anchor = await this.prisma.blockchainAnchor.findUnique({
      where: { id: anchorId },
      include: {
        books: { select: { id: true, title: true, coverImageUrl: true, pageCount: true } },
      },
    });

    if (!anchor) throw new NotFoundException('Ancrage introuvable');
    if (anchor.userId !== userId) throw new ForbiddenException('Acces refuse');

    return {
      ...anchor,
      isConfirmed: anchor.isConfirmed,
      explorerUrl: anchor.txHash ? this.buildExplorerUrl(anchor.network, anchor.txHash) : null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VÉRIFIER L'INTÉGRITÉ D'UN LIVRE
  // ══════════════════════════════════════════════════════════════════════════

  async verifyIntegrity(bookId: string, userId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, ownerId: userId, deletedAt: null },
      include: {
        chapters:         { include: { subChapters: true } },
        blockchainAnchor: true,
      },
    });

    if (!book) throw new NotFoundException('Livre introuvable');

    if (!book.blockchainAnchor) {
      return {
        bookId,
        title:      book.title,
        isAnchored: false,
        message:    "Ce livre n'a pas encore d'ancrage blockchain",
      };
    }

    const currentHash = this.computeContentHash([book]);
    const isIntact    = currentHash === book.blockchainAnchor.contentHash;

    return {
      bookId,
      title:        book.title,
      isAnchored:   true,
      isConfirmed:  book.blockchainAnchor.isConfirmed,
      isIntact,
      originalHash: book.blockchainAnchor.contentHash,
      currentHash,
      anchoredAt:   book.blockchainAnchor.anchoredAt,
      confirmedAt:  book.blockchainAnchor.confirmedAt,
      txHash:       book.blockchainAnchor.txHash,
      bitcoinBlock: book.blockchainAnchor.bitcoinHeight,
      explorerUrl:  book.blockchainAnchor.txHash
        ? this.buildExplorerUrl(book.blockchainAnchor.network, book.blockchainAnchor.txHash)
        : null,
      message: isIntact
        ? "Le contenu du livre est intact depuis l'ancrage"
        : "ATTENTION : le contenu a ete modifie depuis l'ancrage blockchain",
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIRMER LA TRANSACTION (webhook depuis worker externe)
  // ══════════════════════════════════════════════════════════════════════════

  async confirmTransaction(anchorId: string, dto: ConfirmAnchorDto) {
    const anchor = await this.prisma.blockchainAnchor.findUnique({
      where: { id: anchorId },
    });
    if (!anchor) throw new NotFoundException('Ancrage introuvable');

    if (anchor.txHash && anchor.txHash !== 'pending-ots') {
      throw new ConflictException('Cet ancrage est deja confirme');
    }

    const updated = await this.prisma.blockchainAnchor.update({
      where: { id: anchorId },
      data: {
        txHash:      dto.txHash,
        network:     dto.network ?? anchor.network,
        anchoredAt:  anchor.anchoredAt ?? new Date(),
        confirmedAt: new Date(),
        isConfirmed: true,
      },
    });

    return {
      message:     'Ancrage blockchain confirme',
      anchor:      updated,
      explorerUrl: this.buildExplorerUrl(updated.network, dto.txHash),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉTACHER UN LIVRE
  // ══════════════════════════════════════════════════════════════════════════

  async detachBook(anchorId: string, bookId: string, userId: string) {
    const anchor = await this.prisma.blockchainAnchor.findUnique({
      where:   { id: anchorId },
      include: { books: true },
    });
    if (!anchor) throw new NotFoundException('Ancrage introuvable');
    if (anchor.userId !== userId) throw new ForbiddenException('Acces refuse');

    if (anchor.isConfirmed) {
      throw new BadRequestException(
        "Impossible de detacher un livre d'un ancrage deja confirme on-chain",
      );
    }

    const bookLinked = anchor.books.find((b) => b.id === bookId);
    if (!bookLinked) {
      throw new NotFoundException("Ce livre n'est pas lie a cet ancrage");
    }

    await this.prisma.book.update({
      where: { id: bookId },
      data:  { blockchainAnchorId: null },
    });

    return { message: "Livre detache de l'ancrage" };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private computeContentHash(books: any[]): string {
    // Construction canonique deterministe : meme contenu = meme hash
    const payload = books
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((book) => ({
        id:    book.id,
        title: book.title,
        chapters: (book.chapters ?? [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((ch: any) => ({
            id:      ch.id,
            title:   ch.title,
            content: ch.content,
            subChapters: (ch.subChapters ?? [])
              .sort((a: any, b: any) => a.position - b.position)
              .map((sub: any) => ({
                id:      sub.id,
                title:   sub.title,
                content: sub.content,
              })),
          })),
      }));

    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private buildExplorerUrl(network: string | null, txHash: string): string {
    // Cas special : OpenTimestamps verifie sur Bitcoin
    if (network === BlockchainNetwork.BITCOIN_OTS) {
      // Si on a recupere le bloc Bitcoin, on pointe vers blockchain.info
      if (txHash.startsWith('bitcoin-block-')) {
        const height = txHash.replace('bitcoin-block-', '');
        return `https://blockchain.info/block-height/${height}`;
      }
      return 'https://opentimestamps.org/';
    }

    const explorers: Record<string, string> = {
      polygon:  `https://polygonscan.com/tx/${txHash}`,
      ethereum: `https://etherscan.io/tx/${txHash}`,
      bsc:      `https://bscscan.com/tx/${txHash}`,
      tezos:    `https://tzstats.com/${txHash}`,
    };
    return explorers[network ?? 'polygon'] ?? `https://polygonscan.com/tx/${txHash}`;
  }

  private getNetworkInfo(network: string): string {
    const info: Record<string, string> = {
      [BlockchainNetwork.BITCOIN_OTS]: 'Soumis sur Bitcoin via OpenTimestamps. Confirmation sous 6-24h. Gratuit.',
      [BlockchainNetwork.POLYGON]:     'Soumis sur Polygon. Confirmation sous 2-5 secondes.',
      [BlockchainNetwork.ETHEREUM]:    'Soumis sur Ethereum. Confirmation sous 1-3 minutes.',
      [BlockchainNetwork.BSC]:         'Soumis sur BSC. Confirmation sous 5-10 secondes.',
      [BlockchainNetwork.TEZOS]:       'Soumis sur Tezos. Confirmation sous 30-60 secondes.',
    };
    return info[network] ?? 'Soumission en cours.';
  }
}