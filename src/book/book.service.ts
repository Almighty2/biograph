import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import {
  CreateChapterDto,
  UpdateChapterDto,
  CreateSubChapterDto,
  UpdateSubChapterDto,
} from './dto/chapter-book.dto';
import {
  InviteCollaboratorDto,
  UpdateCollaboratorRoleDto,
  ExportBookDto,
  CreateVersionDto,
  UpdateVisibilityDto,
  AddTagsDto,
  AddFavoriteDto,
} from './dto/book-extras.dto';
import { BookStatus, Visibility } from './enums/book.enum';
import * as crypto from 'crypto';
import slugify from 'slugify';
import { PrismaService } from 'src/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { CreateChapterImageDto, UpdateChapterImageDto } from './dto/create-chapter-image.dto';
import { promises as fs } from 'fs';
import * as path from 'path';
const PDFDocument = require('pdfkit');
import { EPub } from 'epub-gen-memory';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { NotificationType } from 'src/notification/dto/notification.dto';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  EDITOR: 'Éditeur',
  REVIEWER: 'Relecteur',
  READER: 'Lecteur',
};

@Injectable()
export class BookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // LIVRES
  // ══════════════════════════════════════════════════════════════════════════

  async create(ownerId: string, dto: CreateBookDto) {
    const slug = await this.generateUniqueSlug(dto.title);
    console.log('ownerId ',ownerId)
    const book = await this.prisma.book.create({
      data: {
        ownerId: ownerId,
        title: dto.title,
        subtitle: dto.subtitle,
        slug,
        description: dto.description,
        language: dto.language ?? 'fr',
        genre: dto.genre,
        visibility: dto.visibility ?? Visibility.PRIVATE,
        targetWordCount: dto.targetWordCount,
        targetPageCount: dto.targetPageCount,
        coverImageUrl: dto.coverImageUrl,
        coverStyle: dto.coverStyle,
      },
      include: { chapters: true, tags: { include: { tag: true } } },
    });

    return { message: 'Livre créé avec succès', book };
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const whereClause = {
      deletedAt: null,
      OR: [
        { ownerId: userId },
        { collaborations: { some: { userId } } },
      ],
    };

    const [books, total] = await Promise.all([
      this.prisma.book.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          chapters: { select: { id: true, title: true, position: true, isComplete: true } },
          tags: { include: { tag: true } },
          collaborations: { where: { userId }, select: { role: true, acceptedAt: true } },
          _count: { select: { chapters: true, collaborations: true } },
        },
      }),
      this.prisma.book.count({ where: whereClause }),
    ]);

    const booksWithMeta = books.map(b => ({
      ...b,
      isOwner: b.ownerId === userId,
      collaborationRole: b.collaborations?.[0]?.role ?? null,
    }));

    return {
      data: booksWithMeta,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, userId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id, deletedAt: null },
      include: {
        chapters: {
          orderBy: { position: 'asc' },
          include: {
            subChapters: { orderBy: { position: 'asc' } },
            images: true,
          },
        },
        tableOfContents: true,
        tags: { include: { tag: true } },
        collaborations: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 5 },
        _count: { select: { chapters: true, collaborations: true, exports: true } },
      },
    });

    if (!book) throw new NotFoundException('Livre introuvable');

    await this.checkReadAccess(book, userId);

    return book;
  }

  async findBySlug(slug: string, userId?: string) {
    const book = await this.prisma.book.findFirst({
      where: { slug, deletedAt: null },
      include: {
        chapters: { orderBy: { position: 'asc' } },
        tags: { include: { tag: true } },
      },
    });

    if (!book) throw new NotFoundException('Livre introuvable');

    if (book.visibility === Visibility.PRIVATE) {
      if (!userId || book.ownerId !== userId) {
        throw new ForbiddenException('Accès refusé');
      }
    }

    return book;
  }

  async update(id: string, userId: string, dto: UpdateBookDto) {
    const book = await this.getBookOrFail(id);
    await this.checkWriteAccess(book, userId);

    const updated = await this.prisma.book.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.status === BookStatus.PUBLISHED && !book.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
      include: { chapters: true, tags: { include: { tag: true } } },
    });

    return { message: 'Livre mis à jour', book: updated };
  }

  async remove(id: string, userId: string) {
    const book = await this.getBookOrFail(id);
    if (book.ownerId !== userId) throw new ForbiddenException('Seul le propriétaire peut supprimer ce livre');

    await this.prisma.book.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Livre supprimé' };
  }

  async publish(id: string, userId: string) {
    const book = await this.getBookOrFail(id);
    await this.checkWriteAccess(book, userId);

    const updated = await this.prisma.book.update({
      where: { id },
      data: { status: BookStatus.PUBLISHED, publishedAt: new Date() },
    });

    // Notifier tous les collaborateurs que le livre est publié
    this.prisma.collaboration.findMany({ where: { bookId: id } })
      .then(collabs => Promise.allSettled(
        collabs.map(c => this.notificationService.create({
          userId: c.userId,
          type: NotificationType.SYSTEM,
          title: 'Livre publié',
          body: `Le livre "${book.title}" vient d'être publié.`,
          data: { bookId: id },
        }))
      ))
      .catch(() => {});

    return { message: 'Livre publié', book: updated };
  }

  async archive(id: string, userId: string) {
    const book = await this.getBookOrFail(id);
    if (book.ownerId !== userId) throw new ForbiddenException('Accès refusé');

    await this.prisma.book.update({
      where: { id },
      data: { status: BookStatus.ARCHIVED },
    });

    return { message: 'Livre archivé' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHAPITRES
  // ══════════════════════════════════════════════════════════════════════════

  async createChapter(bookId: string, userId: string, dto: CreateChapterDto) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    const wordCount = dto.content ? this.countWords(dto.content) : 0;

    const chapter = await this.prisma.chapter.create({
      data: { bookId, ...dto, wordCount },
    });

    await this.recalculateBookStats(bookId);

    return { message: 'Chapitre créé', chapter };
  }

  async updateChapter(bookId: string, chapterId: string, userId: string, dto: UpdateChapterDto) {
    await this.getBookOrFail(bookId);
    const chapter = await this.prisma.chapter.findFirst({ where: { id: chapterId, bookId } });
    if (!chapter) throw new NotFoundException('Chapitre introuvable');

    const wordCount = dto.content !== undefined ? this.countWords(dto.content ?? '') : chapter.wordCount;

    const updated = await this.prisma.chapter.update({
      where: { id: chapterId },
      data: { ...dto, wordCount },
    });

    await this.recalculateBookStats(bookId);

    return { message: 'Chapitre mis à jour', chapter: updated };
  }

  async deleteChapter(bookId: string, chapterId: string, userId: string) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    await this.prisma.chapter.delete({ where: { id: chapterId } });
    await this.recalculateBookStats(bookId);

    return { message: 'Chapitre supprimé' };
  }

  async reorderChapters(bookId: string, userId: string, order: { id: string; position: number }[]) {

    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    await this.prisma.$transaction(
      order.map(({ id, position }) =>
        this.prisma.chapter.update({ where: { id }, data: { position } }),
      ),
    );

    return { message: 'Chapitres réordonnés' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SOUS-CHAPITRES
  // ══════════════════════════════════════════════════════════════════════════

  async createSubChapter(bookId: string, chapterId: string, userId: string, dto: CreateSubChapterDto) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    const chapter = await this.prisma.chapter.findFirst({ where: { id: chapterId, bookId } });
    if (!chapter) throw new NotFoundException('Chapitre introuvable');

    const wordCount = dto.content ? this.countWords(dto.content) : 0;

    const subChapter = await this.prisma.subChapter.create({
      data: { chapterId, ...dto, wordCount },
    });

    await this.recalculateBookStats(bookId);

    return { message: 'Sous-chapitre créé', subChapter };
  }

  async updateSubChapter(bookId: string, chapterId: string, subChapterId: string, userId: string, dto: UpdateSubChapterDto) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    const sub = await this.prisma.subChapter.findFirst({ where: { id: subChapterId, chapterId } });
    if (!sub) throw new NotFoundException('Sous-chapitre introuvable');

    const wordCount = dto.content !== undefined ? this.countWords(dto.content ?? '') : sub.wordCount;

    const updated = await this.prisma.subChapter.update({
      where: { id: subChapterId },
      data: { ...dto, wordCount },
    });

    await this.recalculateBookStats(bookId);

    return { message: 'Sous-chapitre mis à jour', subChapter: updated };
  }

  async deleteSubChapter(bookId: string, chapterId: string, subChapterId: string, userId: string) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    await this.prisma.subChapter.delete({ where: { id: subChapterId } });
    await this.recalculateBookStats(bookId);

    return { message: 'Sous-chapitre supprimé' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLLABORATIONS
  // ══════════════════════════════════════════════════════════════════════════

  async inviteCollaborator(bookId: string, invitedBy: string, dto: InviteCollaboratorDto) {
    const book = await this.getBookOrFail(bookId);
    if (book.ownerId !== invitedBy) throw new ForbiddenException('Seul le propriétaire peut inviter des collaborateurs');

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('Aucun utilisateur trouvé avec cet email');

    if (user.id === invitedBy) throw new BadRequestException('Vous ne pouvez pas vous inviter vous-même');

    const existing = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId, userId: user.id } },
    });
    if (existing) throw new ConflictException('Cet utilisateur collabore déjà sur ce livre');

    const collaboration = await this.prisma.collaboration.create({
      data: {
        bookId,
        userId: user.id,
        role: dto.role ?? 'READER',
        invitedBy,
      },
      include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
    });

    // Notifier le collaborateur invité
    this.notificationService.create({
      userId: user.id,
      type: NotificationType.COLLABORATION_INVITE,
      title: 'Invitation à collaborer',
      body: `Vous avez été invité à collaborer sur "${book.title}" en tant que ${ROLE_LABELS[dto.role ?? 'READER']}.`,
      data: { bookId, role: dto.role ?? 'READER' },
    }).catch(() => {});

    return { message: 'Collaborateur invité', collaboration };
  }

  // Ajoutez cette vérification dans votre service
  async updateCollaboratorRole(bookId: string, userId: string, collaboratorId: string, dto: UpdateCollaboratorRoleDto) {
    console.log('collaboratorId ', collaboratorId)
    const book = await this.getBookOrFail(bookId);
    if (book.ownerId !== userId) throw new ForbiddenException('Accès refusé');

    // Vérifier si le collaborateur existe
    const existingCollaboration = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId, userId: collaboratorId } },
    });

    if (!existingCollaboration) {
      throw new NotFoundException(`Collaborateur avec l'ID ${collaboratorId} non trouvé pour ce livre`);
    }

    const updated = await this.prisma.collaboration.update({
      where: { bookId_userId: { bookId, userId: collaboratorId } },
      data: { role: dto.role },
    });

    // Notifier le collaborateur de son nouveau rôle
    this.notificationService.create({
      userId: collaboratorId,
      type: NotificationType.COLLABORATION_INVITE,
      title: 'Rôle modifié',
      body: `Votre rôle sur "${book.title}" a été modifié : ${ROLE_LABELS[dto.role] ?? dto.role}.`,
      data: { bookId, role: dto.role },
    }).catch(() => {});

    return { message: 'Rôle mis à jour', collaboration: updated };
  }

  async removeCollaborator(bookId: string, ownerId: string, collaboratorId: string) {
    const book = await this.getBookOrFail(bookId);
    if (book.ownerId !== ownerId) throw new ForbiddenException('Accès refusé');

    await this.prisma.collaboration.delete({
      where: { bookId_userId: { bookId, userId: collaboratorId } },
    });

    return { message: 'Collaborateur retiré' };
  }

  async getCollaborators(bookId: string) {
    return this.prisma.collaboration.findMany({
      where: { bookId },
      include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VERSIONS
  // ══════════════════════════════════════════════════════════════════════════

  async createVersion(bookId: string, userId: string, dto: CreateVersionDto) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    const lastVersion = await this.prisma.bookVersion.findFirst({
      where: { bookId },
      orderBy: { versionNumber: 'desc' },
    });

    const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    const snapshot = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: { chapters: { include: { subChapters: true } } },
    });

    const version = await this.prisma.bookVersion.create({
      data: {
        bookId,
        versionNumber,
        snapshot: snapshot as any,
        label: dto.label,
        createdBy: userId,
      },
    });

    return { message: `Version ${versionNumber} sauvegardée`, version };
  }

  async getVersions(bookId: string) {
    //await this.checkBookAccess(bookId, userId);
    return this.prisma.bookVersion.findMany({
      where: { bookId },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true, label: true, createdBy: true, createdAt: true },
    });
  }

  async restoreVersion(bookId: string, versionId: string, userId: string) {
    const book = await this.getBookOrFail(bookId);
    if (book.ownerId !== userId) throw new ForbiddenException('Accès refusé');

    const version = await this.prisma.bookVersion.findFirst({ where: { id: versionId, bookId } });
    if (!version) throw new NotFoundException('Version introuvable');

    const snap = version.snapshot as any;

    await this.prisma.$transaction(async (tx) => {
      await tx.chapter.deleteMany({ where: { bookId } });

      for (const ch of snap.chapters ?? []) {
        const { subChapters, id: _id, bookId: _bid, createdAt: _ca, updatedAt: _ua, ...chData } = ch;
        const newChapter = await tx.chapter.create({ data: { ...chData, bookId } });

        for (const sub of subChapters ?? []) {
          const { id: _sid, chapterId: _cid, createdAt: _sca, updatedAt: _sua, ...subData } = sub;
          await tx.subChapter.create({ data: { ...subData, chapterId: newChapter.id } });
        }
      }
    });

    return { message: `Livre restauré à la version ${version.versionNumber}` };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ══════════════════════════════════════════════════════════════════════════

  // ─── Méthode publique : déclencher l'export ──────────────────────────────

  async requestExport(bookId: string, userId: string, dto: ExportBookDto) {
    const book = await this.getBookOrFail(bookId);
    await this.checkReadAccess(book, userId);

    const exportRecord = await this.prisma.bookExport.create({
      data: { bookId, format: dto.format, status: 'PENDING' },
    });

    // Lance la génération en arrière-plan
    this.generateExportInBackground(exportRecord.id).catch(err => {
      console.error(`[Export ${exportRecord.id}] Echec:`, err);
    });

    return { message: 'Export en cours de preparation', export: exportRecord };
  }


  // ─── Génération en arrière-plan ──────────────────────────────────────────

  private async generateExportInBackground(exportId: string) {
    await this.prisma.bookExport.update({
      where: { id: exportId },
      data:  { status: 'PROCESSING' },
    });

    try {
      // 1. Récupérer le livre avec tous ses chapitres ordonnés
      const exportRecord = await this.prisma.bookExport.findUnique({
        where: { id: exportId },
        include: {
          book: {
            include: {
              chapters: {
                orderBy: { position: 'asc' },
                include: { subChapters: { orderBy: { position: 'asc' } } },
              },
              owner: { select: { fullName: true, email: true } },
            },
          },
        },
      });

      if (!exportRecord || !exportRecord.book) {
        throw new Error('Export ou livre introuvable');
      }

      const { book, format } = exportRecord;

      // 2. Aiguiller selon le format demandé
      let buffer: Buffer;
      let extension: string;
      let mimeType: string;

      switch (format) {
        case 'PDF':
          buffer = await this.generatePDF(book);
          extension = 'pdf';
          mimeType = 'application/pdf';
          break;
        case 'EPUB':
          buffer = await this.generateEPUB(book);
          extension = 'epub';
          mimeType = 'application/epub+zip';
          break;
        case 'DOCX':
          buffer = await this.generateDOCX(book);
          extension = 'docx';
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        default:
          throw new Error(`Format non supporte : ${format}`);
      }

      // 3. Sauvegarder le fichier
      const uploadDir = path.join(process.cwd(), 'uploads', 'exports');
      await fs.mkdir(uploadDir, { recursive: true });

      const fileName = `${exportId}.${extension}`;
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, buffer);

      const fileUrl = `/uploads/exports/${fileName}`;

      // 4. Mettre à jour la BDD
      await this.prisma.bookExport.update({
        where: { id: exportId },
        data: {
          status:      'DONE',
          fileUrl,
          fileSize:    buffer.length,
          mimeType,
          completedAt: new Date(),
        },
      });

      console.log(
        `[Export ${exportId}] OK | ${format} | ${(buffer.length / 1024).toFixed(1)} Ko`,
      );
    } catch (err: any) {
      await this.prisma.bookExport.update({
        where: { id: exportId },
        data: {
          status:       'FAILED',
          errorMessage: err.message ?? 'Erreur inconnue',
        },
      });
      throw err;
    }
  }

  // ─── Génération PDF ──────────────────────────────────────────────────────

  private async generatePDF(book: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A5',
        margins: { top: 60, bottom: 60, left: 50, right: 50 },
        info: {
          Title:    book.title,
          Author:   book.owner?.fullName ?? 'Inconnu',
          Subject:  book.subtitle ?? '',
          Keywords: 'biograf-ai',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ─── Page de couverture ─────────────────
      doc.fontSize(32).font('Times-Bold').text(book.title, { align: 'center' });
      if (book.subtitle) {
        doc.moveDown(0.5);
        doc.fontSize(16).font('Times-Italic').text(book.subtitle, { align: 'center' });
      }
      doc.moveDown(8);
      doc.fontSize(14).font('Times-Roman').text(`par ${book.owner?.fullName ?? 'Auteur'}`, { align: 'center' });
      doc.moveDown(15);
      doc.fontSize(10).fillColor('gray').text('Genere avec Biograf AI', { align: 'center' });

      // ─── Table des matières ─────────────────
      doc.addPage();
      doc.fontSize(20).font('Times-Bold').fillColor('black').text('Table des matieres', { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(11).font('Times-Roman');
      book.chapters.forEach((ch: any, i: number) => {
        doc.text(`${i + 1}. ${ch.title}`, { paragraphGap: 4 });
      });

      // ─── Chapitres ──────────────────────────
      book.chapters.forEach((ch: any) => {
        doc.addPage();
        doc.fontSize(11).fillColor('gray').text(`Chapitre ${ch.position}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(22).font('Times-Bold').fillColor('black').text(ch.title, { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(11).font('Times-Roman').text(ch.content || '(Chapitre vide)', {
          align: 'justify',
          lineGap: 3,
        });
      });

      doc.end();
    });
  }

  // ─── Génération DOCX ─────────────────────────────────────────────────────

  private async generateDOCX(book: any): Promise<Buffer> {
    const children: Paragraph[] = [];

    // Titre + sous-titre
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: book.title, bold: true, size: 56 })],
        alignment: 'center',
      }),
    );
    if (book.subtitle) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: book.subtitle, italics: true, size: 28 })],
          alignment: 'center',
        }),
      );
    }
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `par ${book.owner?.fullName ?? 'Auteur'}`, size: 24 })],
        alignment: 'center',
        spacing:   { before: 400, after: 800 },
      }),
    );

    // Chapitres
    book.chapters.forEach((ch: any) => {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: ch.title, bold: true })],
          pageBreakBefore: true,
        }),
      );

      // Découper le contenu en paragraphes
      const paragraphs = (ch.content || '(Chapitre vide)').split(/\n\n+/);
      paragraphs.forEach((p: string) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: p, size: 24 })],
            spacing:  { line: 360 }, // 1.5 interligne
          }),
        );
      });
    });

    const doc = new Document({
      creator:     book.owner?.fullName ?? 'Biograf AI',
      title:       book.title,
      description: book.description ?? '',
      sections: [{ children }],
    });

    return Packer.toBuffer(doc);
  }

  // ─── Helper : échappement HTML pour EPUB ─────────────────────────────────

  private htmlEscape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Génération EPUB ─────────────────────────────────────────────────────

  private async generateEPUB(book: any): Promise<Buffer> {
    const options = {
      title:       book.title,
      author:      book.owner?.fullName ?? 'Auteur inconnu',
      description: book.description ?? book.subtitle ?? '',
      lang:        book.language ?? 'fr',
      publisher:   'Biograf AI',
    };

    const chapters = book.chapters.map((ch: any) => ({
      title: ch.title,
      // ✅ "content" et non "data"
      content: this.htmlEscape(ch.content || '(Chapitre vide)')
                .split(/\n\n+/)
                .map((p: string) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
                .join('\n'),
    }));

    const epub = new EPub(options, chapters);
    return epub.genEpub() as Promise<Buffer>;
  }


  async getExports(bookId: string, userId: string) {
      // ✅ Garde-fou : userId obligatoire
    if (!userId) {
      throw new BadRequestException('userId est requis pour acceder a ce livre');
    }
    const book = await this.getBookOrFail(bookId);
    await this.checkReadAccess(book, userId);

    return this.prisma.bookExport.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISIBILITE & PARTAGE
  // ══════════════════════════════════════════════════════════════════════════

  async updateVisibility(bookId: string, userId: string, dto: UpdateVisibilityDto) {
    const book = await this.getBookOrFail(bookId);
    if (book.ownerId !== userId) throw new ForbiddenException('Accès refusé');

    const data: any = { visibility: dto.visibility };

    if (dto.visibility === Visibility.RESTRICTED && !book.shareToken) {
      data.shareToken = crypto.randomBytes(16).toString('hex');
    }

    if (dto.visibility !== Visibility.RESTRICTED) {
      data.shareToken = null;
    }

    const updated = await this.prisma.book.update({ where: { id: bookId }, data });

    return {
      message: 'Visibilité mise à jour',
      visibility: updated.visibility,
      shareToken: updated.shareToken ?? undefined,
      shareUrl: updated.shareToken ? `https://biograf.app/share/${updated.shareToken}` : undefined,
    };
  }

  async accessByShareToken(token: string) {
    const book = await this.prisma.book.findFirst({
      where: { shareToken: token, deletedAt: null },
      include: { chapters: { orderBy: { position: 'asc' } }, tags: { include: { tag: true } } },
    });

    if (!book) throw new NotFoundException('Lien de partage invalide ou expiré');

    return book;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAGS
  // ══════════════════════════════════════════════════════════════════════════

  async addTags(bookId: string, userId: string, dto: AddTagsDto) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    for (const name of dto.tags) {
      const tag = await this.prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });

      await this.prisma.bookTag.upsert({
        where: { bookId_tagId: { bookId, tagId: tag.id } },
        update: {},
        create: { bookId, tagId: tag.id },
      });
    }

    return { message: 'Tags ajoutés' };
  }

  async removeTag(bookId: string, tagId: string, userId: string) {
    const book = await this.getBookOrFail(bookId);
    await this.checkWriteAccess(book, userId);

    await this.prisma.bookTag.delete({
      where: { bookId_tagId: { bookId, tagId } },
    });

    return { message: 'Tag retiré' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FAVORIS
  // ══════════════════════════════════════════════════════════════════════════

  async addFavorite(bookId: string, userId: string, dto: AddFavoriteDto) {
    await this.getBookOrFail(bookId);

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_bookId_chapterId: { userId, bookId, chapterId: dto.chapterId ?? 'null' } },
    });

    if (existing) throw new ConflictException('Déjà dans vos favoris');

    const favorite = await this.prisma.favorite.create({
      data: { userId, bookId, chapterId: dto.chapterId, note: dto.note },
    });

    return { message: 'Ajouté aux favoris', favorite };
  }

  async removeFavorite(bookId: string, userId: string, favoriteId: string) {
    await this.prisma.favorite.deleteMany({ where: { id: favoriteId, userId, bookId } });
    return { message: 'Retiré des favoris' };
  }

  async getFavorites(userId: string) {
    console.log('userId ',userId)
    return this.prisma.favorite.findMany({
      where: { userId },
      include: { book: { select: { id: true, title: true, coverImageUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TABLE DES MATIÈRES
  // ══════════════════════════════════════════════════════════════════════════

  async generateTableOfContents(bookId: string, userId: string) {
    const book = await this.getBookOrFail(bookId);
    await this.checkReadAccess(book, userId);

    const chapters = await this.prisma.chapter.findMany({
      where: { bookId },
      orderBy: { position: 'asc' },
      include: { subChapters: { orderBy: { position: 'asc' } } },
    });

    const content = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      position: ch.position,
      wordCount: ch.wordCount,
      isComplete: ch.isComplete,
      subChapters: ch.subChapters.map((sub) => ({
        id: sub.id,
        title: sub.title,
        position: sub.position,
        wordCount: sub.wordCount,
      })),
    }));

    const toc = await this.prisma.tableOfContents.upsert({
      where: { bookId },
      update: { content },
      create: { bookId, content },
    });

    return { message: 'Table des matières générée', tableOfContents: toc };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVÉS
  // ══════════════════════════════════════════════════════════════════════════

  private async getBookOrFail(id: string) {
    const book = await this.prisma.book.findFirst({ where: { id, deletedAt: null } });
    if (!book) throw new NotFoundException('Livre introuvable');
    return book;
  }

  private async checkReadAccess(book: any, userId: string) {
    if (book.visibility === Visibility.PUBLIC) return;
    if (book.ownerId === userId) return;

    const collab = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId: book.id, userId } },
    });
    if (!collab) throw new ForbiddenException('Accès refusé à ce livre');
  }

  private async checkWriteAccess(book: any, userId: string) {
    if (book.ownerId === userId) return;

    const collab = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId: book.id, userId } },
    });

    if (!collab || collab.role === 'READER' || collab.role === 'COMMENTER') {
      throw new ForbiddenException("Vous n'avez pas les droits pour modifier ce livre");
    }
  }

  private async checkBookAccess(book: any, userId: string) {
    if (book.ownerId === userId) return;
    
    const collab = await this.prisma.collaboration.findUnique({
      where: {
        bookId_userId: {
          bookId: book.id,  // ✅ Ajouter bookId
          userId: userId,
        }
      }
    });
    
    if (!collab || collab.role !== 'EDITOR' && collab.role !== 'ADMIN') {
      throw new ForbiddenException('Accès refusé');
    }
  }
  private async generateUniqueSlug(title: string): Promise<string> {
    const base = slugify(title, { lower: true, strict: true });
    let slug = base;
    let i = 1;

    while (await this.prisma.book.findUnique({ where: { slug } })) {
      slug = `${base}-${i++}`;
    }

    return slug;
  }

  private async recalculateBookStats(bookId: string) {
    const chapters = await this.prisma.chapter.findMany({
      where: { bookId },
      include: { subChapters: true },
    });

    const wordCount = chapters.reduce((acc, ch) => {
      const subWords = ch.subChapters.reduce((s, sub) => s + sub.wordCount, 0);
      return acc + ch.wordCount + subWords;
    }, 0);

    const pageCount = Math.ceil(wordCount / 250);
    const totalChapters = chapters.length;
    const completedChapters = chapters.filter((c) => c.isComplete).length;
    const progressPct = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

    await this.prisma.book.update({
      where: { id: bookId },
      data: { wordCount, pageCount, progressPct },
    });
  }

  private countWords(text: string): number {
    return text
      .replace(/<[^>]*>/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
  }

  // ─── Ajouter une image ────────────────────────────────────────────────────
 
  async createChapterImage(
    bookId: string,
    chapterId: string,
    userId: string,
    dto: CreateChapterImageDto,
  ) {
    await this.checkWriteAccessChapterImage(bookId, userId);
    await this.checkChapterBelongsToBook(chapterId, bookId);
 
    const image = await this.prisma.chapterImage.create({
      data: {
        chapterId,
        url: dto.url,
        caption: dto.caption,
        altText: dto.altText,
        position: dto.position,
        source: dto.source ?? 'UPLOAD',
      },
    });
 
    return { message: 'Image ajoutée au chapitre', image };
  }
 
  // ─── Lister les images d'un chapitre ─────────────────────────────────────
 
  async findAllChapterImage(bookId: string, chapterId: string, userId: string) {
    await this.checkReadAccessChapterImage(bookId, userId);
    await this.checkChapterBelongsToBook(chapterId, bookId);
 
    const images = await this.prisma.chapterImage.findMany({
      where: { chapterId },
      orderBy: { position: 'asc' },
    });
 
    return { data: images, total: images.length };
  }
 
  // ─── Mettre à jour une image ──────────────────────────────────────────────
 
  async updateChapterImage(
    bookId: string,
    chapterId: string,
    imageId: string,
    userId: string,
    dto: UpdateChapterImageDto,
  ) {
    await this.checkWriteAccessChapterImage(bookId, userId);
    await this.checkChapterBelongsToBook(chapterId, bookId);
    await this.getImageOrFail(imageId, chapterId);

    // Construire l'objet data avec seulement les champs fournis
    const updateData: any = {};
    
    if (dto.url !== undefined) {
      updateData.url = dto.url;
    }
    if (dto.caption !== undefined) {
      updateData.caption = dto.caption;
    }
    if (dto.altText !== undefined) {
      updateData.altText = dto.altText;
    }
    if (dto.position !== undefined) {
      updateData.position = dto.position;
    }

    const updated = await this.prisma.chapterImage.update({
      where: { id: imageId },
      data: updateData,
    });

    return { message: 'Image mise à jour', image: updated };
  }
 
  // ─── Supprimer une image ──────────────────────────────────────────────────
 
  async removeChapterImage(
    bookId: string,
    chapterId: string,
    imageId: string,
    userId: string,
  ) {
    await this.checkWriteAccessChapterImage(bookId, userId);
    await this.checkChapterBelongsToBook(chapterId, bookId);
    await this.getImageOrFail(imageId, chapterId);
 
    await this.prisma.chapterImage.delete({ where: { id: imageId } });
 
    return { message: 'Image supprimée' };
  }
 
  // ─── Réordonner les images ────────────────────────────────────────────────
 
  async reorderChapterImage(
    bookId: string,
    chapterId: string,
    userId: string,
    order: { id: string; position: number }[],
  ) {
    await this.checkWriteAccessChapterImage(bookId, userId);
    await this.checkChapterBelongsToBook(chapterId, bookId);
 
    await this.prisma.$transaction(
      order.map(({ id, position }) =>
        this.prisma.chapterImage.update({ where: { id }, data: { position } }),
      ),
    );
 
    return { message: 'Images réordonnées' };
  }
 
  // ─── Helpers privés ───────────────────────────────────────────────────────
 
  private async getImageOrFail(imageId: string, chapterId: string) {
    const image = await this.prisma.chapterImage.findFirst({
      where: { id: imageId, chapterId },
    });
    if (!image) throw new NotFoundException('Image introuvable');
    return image;
  }
 
  private async checkChapterBelongsToBook(chapterId: string, bookId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, bookId },
    });
    if (!chapter) throw new NotFoundException('Chapitre introuvable dans ce livre');
  }
 
  private async checkReadAccessChapterImage(bookId: string, userId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, deletedAt: null },
    });
    if (!book) throw new NotFoundException('Livre introuvable');
 
    if (book.visibility === 'PUBLIC') return;
    if (book.ownerId === userId) return;
 
    const collab = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId, userId } },
    });
    if (!collab) throw new ForbiddenException('Accès refusé');
  }
 
  private async checkWriteAccessChapterImage(bookId: string, userId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, deletedAt: null },
    });
    if (!book) throw new NotFoundException('Livre introuvable');
 
    if (book.ownerId === userId) return;
 
    const collab = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId, userId } },
    });
 
    if (!collab || collab.role === 'READER' || collab.role === 'COMMENTER') {
      throw new ForbiddenException("Vous n'avez pas les droits pour modifier ce chapitre");
    }
  }
}