import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateAiSuggestionDto,
  AcceptSuggestionDto,
  CreateCoverGenerationDto,
} from './dto/create-ai.dto';
import { PrismaService } from 'src/prisma.service';
import { OpenAIService } from 'src/openia/openia.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/dto/notification.dto';

const AI_TYPE_LABELS: Record<string, string> = {
  NARRATIVE_ADVICE: 'Conseil narratif',
  CORRECTION: 'Correction',
  BOOK_PLAN: 'Plan de livre',
  COVER_GENERATION: 'Génération de couverture',
};

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openaiService: OpenAIService,
    private readonly notificationService: NotificationService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // AI SUGGESTIONS
  // ══════════════════════════════════════════════════════════════════════════

  async createSuggestion(userId: string, dto: CreateAiSuggestionDto) {
    if (dto.bookId) await this.checkBookAccess(dto.bookId, userId);
    if (dto.chapterId && dto.bookId) await this.checkChapterBelongsToBook(dto.chapterId, dto.bookId);

      // Récupérer le contexte du chapitre si fourni
    let context: string | undefined;
    if (dto.chapterId) {
      const chapter = await this.prisma.chapter.findUnique({ 
        where: { id: dto.chapterId },
        select: { content: true },
      });
      context = chapter?.content ?? undefined;
    }

    // Appel IA simulé — remplace par ton appel réel (OpenAI, Claude API, etc.)
    const aiResponse = await this.callAiModel(dto.prompt, dto.type);

    const suggestion = await this.prisma.aiSuggestion.create({
      data: {
        bookId: dto.bookId ?? null,
        chapterId: dto.chapterId ?? null,
        type: dto.type,
        prompt: dto.prompt,
        response: aiResponse,
        isAccepted: null,
      },
    });

    // Notifier l'utilisateur qu'une suggestion IA est prête
    this.notificationService.create({
      userId,
      type: NotificationType.AI_SUGGESTION,
      title: 'Nouvelle suggestion IA',
      body: dto.chapterId
        ? `Une suggestion de type "${AI_TYPE_LABELS[dto.type] ?? dto.type}" est disponible pour votre chapitre.`
        : `Une suggestion de type "${AI_TYPE_LABELS[dto.type] ?? dto.type}" est disponible pour votre livre.`,
      data: { suggestionId: suggestion.id, bookId: dto.bookId, chapterId: dto.chapterId },
    }).catch(() => {});

    return { message: 'Suggestion générée', suggestion };
  }

  async getSuggestionsForBook(bookId: string, userId: string) {
    await this.checkBookAccess(bookId, userId);

    const suggestions = await this.prisma.aiSuggestion.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: suggestions, total: suggestions.length };
  }

  async getSuggestionsForChapter(bookId: string, chapterId: string, userId: string) {
    await this.checkBookAccess(bookId, userId);
    await this.checkChapterBelongsToBook(chapterId, bookId);

    const suggestions = await this.prisma.aiSuggestion.findMany({
      where: { chapterId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: suggestions, total: suggestions.length };
  }

  async acceptOrReject(suggestionId: string, userId: string, dto: AcceptSuggestionDto) {
    const suggestion = await this.prisma.aiSuggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion introuvable');

    if (suggestion.bookId) await this.checkBookAccess(suggestion.bookId, userId);

    const updated = await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { isAccepted: dto.isAccepted },
    });

    return {
      message: dto.isAccepted ? 'Suggestion acceptée' : 'Suggestion refusée',
      suggestion: updated,
    };
  }

  async deleteSuggestion(suggestionId: string, userId: string) {
    const suggestion = await this.prisma.aiSuggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion introuvable');

    if (suggestion.bookId) await this.checkBookAccess(suggestion.bookId, userId);

    await this.prisma.aiSuggestion.delete({ where: { id: suggestionId } });

    return { message: 'Suggestion supprimée' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COVER GENERATION
  // ══════════════════════════════════════════════════════════════════════════

  async generateCover(bookId: string, userId: string, dto: CreateCoverGenerationDto) {
    await this.checkBookAccess(bookId, userId);

    // Appel IA simulé — remplace par DALL-E, Stable Diffusion, etc.
    const imageUrl = await this.callImageGenerationModel(dto.prompt, dto.style);

    const cover = await this.prisma.coverGeneration.create({
      data: {
        bookId,
        prompt: dto.prompt,
        style: dto.style,
        imageUrl,
        isSelected: false,
      },
    });

    return { message: 'Couverture générée', cover };
  }

  async getCoversForBook(bookId: string, userId: string) {
    await this.checkBookAccess(bookId, userId);

    const covers = await this.prisma.coverGeneration.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: covers, total: covers.length };
  }

  async selectCover(bookId: string, coverId: string, userId: string) {
    await this.checkBookAccess(bookId, userId);

    const cover = await this.prisma.coverGeneration.findFirst({
      where: { id: coverId, bookId },
    });
    if (!cover) throw new NotFoundException('Couverture introuvable');

    // Désélectionne toutes les autres couvertures du livre
    await this.prisma.$transaction([
      this.prisma.coverGeneration.updateMany({
        where: { bookId },
        data: { isSelected: false },
      }),
      this.prisma.coverGeneration.update({
        where: { id: coverId },
        data: { isSelected: true },
      }),
      this.prisma.book.update({
        where: { id: bookId },
        data: { coverImageUrl: cover.imageUrl, coverStyle: cover.style },
      }),
    ]);

    return { message: 'Couverture sélectionnée et appliquée au livre' };
  }

  async deleteCover(bookId: string, coverId: string, userId: string) {
    await this.checkBookAccess(bookId, userId);

    const cover = await this.prisma.coverGeneration.findFirst({
      where: { id: coverId, bookId },
    });
    if (!cover) throw new NotFoundException('Couverture introuvable');

    if (cover.isSelected) {
      throw new BadRequestException(
        'Impossible de supprimer la couverture sélectionnée. Sélectionne-en une autre d\'abord.',
      );
    }

    await this.prisma.coverGeneration.delete({ where: { id: coverId } });

    return { message: 'Couverture supprimée' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVÉS
  // ══════════════════════════════════════════════════════════════════════════

  private async checkBookAccess(bookId: string, userId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, deletedAt: null },
    });
    if (!book) throw new NotFoundException('Livre introuvable');

    if (book.ownerId === userId) return book;

    const collab = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId, userId } },
    });
    if (!collab) throw new ForbiddenException('Accès refusé à ce livre');

    return book;
  }

  private async checkChapterBelongsToBook(chapterId: string, bookId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, bookId },
    });
    if (!chapter) throw new NotFoundException('Chapitre introuvable dans ce livre');
  }

  // ─── Stubs IA — à remplacer par tes vrais appels API ─────────────────────

  private async callAiModel(prompt: string, type: string, context?: string) {
    const result = await this.openaiService.generateText({
      type:     type as any,
      prompt,
      context,                          // texte du chapitre par exemple
      language: 'fr',
    });
    
    // Tu pourrais sauvegarder le coût pour facturer les utilisateurs
    console.log(`💰 Coût IA : $${result.estimatedCost.toFixed(5)}`);
    
    return result.text;
  }

  private async callImageGenerationModel(prompt: string, style: string): Promise<string> {
    const result = await this.openaiService.generateBookCovers({
      prompt,
      style: style as any,  // 'vintage' | 'moderne' | 'africain' | etc.
      count: 1,
      size:  '1024x1792',
    });
    return result.urls[0];  // URL de la couverture générée
  }
}