import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UpsertWritingStatDto, StatFilterDto } from './dto/writing-stat.dto';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class WritingStatService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // ENREGISTRER UNE SESSION D'ECRITURE (UPSERT)
  // Un seul enregistrement par userId + bookId + date
  // ══════════════════════════════════════════════════════════════════════════

  async upsert(userId: string, dto: UpsertWritingStatDto) {
    // Vérifier que le livre appartient à l'utilisateur si bookId fourni
    if (dto.bookId) {
      const book = await this.prisma.book.findFirst({
        where: { id: dto.bookId, ownerId: userId, deletedAt: null },
      });
      if (!book) throw new NotFoundException('Livre introuvable ou accès refusé');
    }

    // Date du jour par défaut (format YYYY-MM-DD sans heure)
    const date = dto.date
      ? new Date(dto.date)
      : new Date(new Date().toISOString().split('T')[0]);

    // Upsert — additionne les valeurs si une entrée existe déjà pour ce jour
    const existing = await this.prisma.writingStat.findUnique({
      where: {
        userId_bookId_date: {
          userId,
          bookId: dto.bookId ?? '',
          date,
        },
      },
    });

    let stat;

    if (existing) {
      // Additionne les mots et minutes à l'existant
      stat = await this.prisma.writingStat.update({
        where: { id: existing.id },
        data: {
          wordsWritten: existing.wordsWritten + dto.wordsWritten,
          minutesSpent: existing.minutesSpent + dto.minutesSpent,
        },
      });
    } else {
      stat = await this.prisma.writingStat.create({
        data: {
          userId,
          bookId:       dto.bookId ?? null,
          date,
          wordsWritten: dto.wordsWritten,
          minutesSpent: dto.minutesSpent,
        },
      });
    }

    return { message: 'Session d\'écriture enregistrée', stat };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATISTIQUES GLOBALES (résumé)
  // ══════════════════════════════════════════════════════════════════════════

  async getSummary(userId: string, filter: StatFilterDto) {
    const where = this.buildWhere(userId, filter);

    const stats = await this.prisma.writingStat.findMany({ where });

    const totalWords   = stats.reduce((acc, s) => acc + s.wordsWritten, 0);
    const totalMinutes = stats.reduce((acc, s) => acc + s.minutesSpent, 0);
    const totalDays    = new Set(stats.map((s) => s.date.toISOString().split('T')[0])).size;
    const avgWordsPerDay = totalDays > 0 ? Math.round(totalWords / totalDays) : 0;
    const avgMinutesPerDay = totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0;

    return {
      totalWords,
      totalMinutes,
      totalHours:      parseFloat((totalMinutes / 60).toFixed(1)),
      totalDays,
      avgWordsPerDay,
      avgMinutesPerDay,
      bestDay:         this.findBestDay(stats),
      currentStreak:   await this.computeStreak(userId, filter.bookId),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATISTIQUES PAR JOUR (pour graphique)
  // ══════════════════════════════════════════════════════════════════════════

  async getDaily(userId: string, filter: StatFilterDto) {
    const where = this.buildWhere(userId, filter);

    const stats = await this.prisma.writingStat.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return {
      data: stats.map((s) => ({
        date:         s.date.toISOString().split('T')[0],
        wordsWritten: s.wordsWritten,
        minutesSpent: s.minutesSpent,
        bookId:       s.bookId,
      })),
      total: stats.length,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATISTIQUES PAR LIVRE
  // ══════════════════════════════════════════════════════════════════════════

  async getByBook(userId: string) {
    const stats = await this.prisma.writingStat.findMany({
      where: { userId, bookId: { not: null } },
    });

    // Grouper manuellement par bookId
    const grouped: Record<string, { wordsWritten: number; minutesSpent: number; days: number }> = {};

    for (const s of stats) {
      if (!s.bookId) continue;
      if (!grouped[s.bookId]) {
        grouped[s.bookId] = { wordsWritten: 0, minutesSpent: 0, days: 0 };
      }
      grouped[s.bookId].wordsWritten += s.wordsWritten;
      grouped[s.bookId].minutesSpent += s.minutesSpent;
      grouped[s.bookId].days         += 1;
    }

    // Récupérer les titres des livres
    const bookIds = Object.keys(grouped);
    const books = await this.prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: { id: true, title: true, coverImageUrl: true, progressPct: true },
    });

    const result = books.map((book) => ({
      book,
      wordsWritten:    grouped[book.id].wordsWritten,
      minutesSpent:    grouped[book.id].minutesSpent,
      totalHours:      parseFloat((grouped[book.id].minutesSpent / 60).toFixed(1)),
      activeDays:      grouped[book.id].days,
      avgWordsPerDay:  Math.round(grouped[book.id].wordsWritten / grouped[book.id].days),
    }));

    return { data: result, total: result.length };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STREAK D'ECRITURE (jours consécutifs)
  // ══════════════════════════════════════════════════════════════════════════

  async getStreak(userId: string, bookId?: string) {
    const streak = await this.computeStreak(userId, bookId);
    return { currentStreak: streak, unit: 'jours consécutifs' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUPPRIMER UNE ENTRÉE
  // ══════════════════════════════════════════════════════════════════════════

  async remove(statId: string, userId: string) {
    const stat = await this.prisma.writingStat.findUnique({ where: { id: statId } });
    if (!stat)              throw new NotFoundException('Statistique introuvable');
    if (stat.userId !== userId) throw new BadRequestException('Accès refusé');

    await this.prisma.writingStat.delete({ where: { id: statId } });

    return { message: 'Entrée supprimée' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVÉS
  // ══════════════════════════════════════════════════════════════════════════

  private buildWhere(userId: string, filter: StatFilterDto) {
    const where: any = { userId };

    if (filter.bookId) where.bookId = filter.bookId;

    if (filter.from || filter.to) {
      where.date = {};
      if (filter.from) where.date.gte = new Date(filter.from);
      if (filter.to)   where.date.lte = new Date(filter.to);
    }

    return where;
  }

  private findBestDay(stats: any[]) {
    if (!stats.length) return null;

    const best = stats.reduce((max, s) =>
      s.wordsWritten > max.wordsWritten ? s : max,
    );

    return {
      date:         best.date.toISOString().split('T')[0],
      wordsWritten: best.wordsWritten,
      minutesSpent: best.minutesSpent,
    };
  }

  private async computeStreak(userId: string, bookId?: string): Promise<number> {
    const where: any = { userId, wordsWritten: { gt: 0 } };
    if (bookId) where.bookId = bookId;

    const stats = await this.prisma.writingStat.findMany({
      where,
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    if (!stats.length) return 0;

    let streak    = 0;
    let current   = new Date(new Date().toISOString().split('T')[0]);

    for (const s of stats) {
      const statDate = new Date(s.date.toISOString().split('T')[0]);
      const diffDays = Math.round(
        (current.getTime() - statDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays <= 1) {
        streak++;
        current = statDate;
      } else {
        break;
      }
    }

    return streak;
  }
}