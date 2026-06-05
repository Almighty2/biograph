import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateMediaProjectDto, UpdateMediaProjectDto } from './dto/media-project.dto';
import { OpenAIService } from 'src/openia/openia.service';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as mm from 'music-metadata';


@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openaiService: OpenAIService,
  ) {}

  // ─── Créer un projet multimédia ───────────────────────────────────────────

  // Méthode create modifiée
  async create(bookId: string, ownerId: string, dto: CreateMediaProjectDto) {
    await this.checkBookAccess(bookId, ownerId);

    const project = await this.prisma.mediaProject.create({
      data: {
        bookId,
        ownerId,
        type:        dto.type,
        title:       dto.title,
        language:    dto.language ?? 'fr',
        voiceGender: dto.voiceGender ?? 'FEMALE',
        voiceId:     dto.voiceId,
        musicTrack:  dto.musicTrack,
        status:      'PENDING',
      },
    });

    // Lance la génération en arrière-plan (sans bloquer la réponse)
    this.generateMediaInBackground(project.id).catch(err => {
      console.error(`[Media ${project.id}] Echec generation:`, err);
    });

    return { message: 'Projet multimedia cree, generation en cours', project };
  }

  // ─── Génération en arrière-plan ─────────────────────────────────────────

  private async generateMediaInBackground(projectId: string) {
    // 1. Marquer comme PROCESSING
    await this.prisma.mediaProject.update({
      where: { id: projectId },
      data:  { status: 'PROCESSING' },
    });

    try {
      // 2. Récupérer le projet et le livre avec ses chapitres
      const project = await this.prisma.mediaProject.findUnique({
        where: { id: projectId },
        include: {
          book: {
            include: {
              chapters: {
                select: { id: true, title: true, position: true, isComplete: true },
                where:   { isComplete: true },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });

      if (!project || !project.book) {
        throw new Error('Projet ou livre introuvable');
      }

      // 3. Aiguillage selon le type de projet
      if (project.type === 'AUDIO_NARRATION') {
        await this.generateAudioNarration(project);
      } else if (project.type === 'VIDEO_STORY') {
        // À implémenter plus tard (audio + images + assemblage vidéo)
        await this.generateVideoStory(project);
      }
    } catch (err: any) {
      // 4. Marquer comme FAILED si erreur
      await this.prisma.mediaProject.update({
        where: { id: projectId },
        data:  {
          status:       'FAILED',
          error: err.message ?? 'Erreur inconnue',
        },
      });
      throw err;
    }
  }


  private async generateVideoStory(project: any) {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
  
    const uploadDir  = path.join(process.cwd(), 'uploads', 'media');
    const tmpDir     = path.join(uploadDir, `tmp_${project.id}`);
    await fs.mkdir(tmpDir, { recursive: true });
  
    try {
      const chapters: { id: string; title: string; position: number; content?: string }[] =
        project.book.chapters;
  
      if (!chapters.length) {
        throw new Error('Aucun chapitre complet pour générer la vidéo');
      }
  
      // ── Étape 1 : générer l'audio de narration ──────────────────────────────
      const voiceMap: Record<string, string> = {
        FEMALE:  'nova',
        MALE:    'onyx',
        NEUTRAL: 'alloy',
      };
      const voice = voiceMap[project.voiceGender] ?? 'nova';
  
      const fullText = chapters
        .map(ch => `Chapitre ${ch.position}. ${ch.title}.\n\n${ch.content ?? ''}`)
        .join('\n\n---\n\n');
  
      if (!fullText.trim()) {
        throw new Error('Aucun contenu textuel à narrer');
      }
  
      console.log(`[Video ${project.id}] Étape 1/4 — Génération audio...`);
      const audioBuffers: Buffer[] = [];
      const chunks = this.splitTextIntoChunks(fullText, 3500);
  
      for (let i = 0; i < chunks.length; i++) {
        console.log(`[Video ${project.id}]  chunk audio ${i + 1}/${chunks.length}`);
        const result = await this.openaiService.generateAudio({
          text:        chunks[i],
          voice:       voice as any,
          speed:       1.0,
          highQuality: false,
        });
        audioBuffers.push(result.audioBuffer);
      }
  
      const audioBuffer  = Buffer.concat(audioBuffers);
      const audioPath    = path.join(tmpDir, 'narration.mp3');
      await fs.writeFile(audioPath, audioBuffer);
  
      // ── Étape 2 : obtenir la durée audio via ffprobe ─────────────────────────
      console.log(`[Video ${project.id}] Étape 2/4 — Analyse durée audio...`);
      const metadata = await mm.parseFile(audioPath);
      const totalSeconds = metadata.format.duration ?? 0;

      const secondsPerChapter = chapters.length > 0
        ? totalSeconds / chapters.length
        : totalSeconds;
  
      // ── Étape 3 : générer une image par chapitre (DALL-E) ───────────────────
      console.log(`[Video ${project.id}] Étape 3/4 — Génération des images (${chapters.length})...`);
      const imagePaths: string[] = [];
  
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        console.log(`[Video ${project.id}]  image ${i + 1}/${chapters.length} — "${ch.title}"`);
  
        // Construire un prompt concis et visuel à partir du titre + début du contenu
        const contentSnippet = (ch.content ?? '').slice(0, 300).replace(/\n+/g, ' ');
        const imagePrompt = this.buildImagePrompt(
          project.book.title ?? 'Histoire',
          ch.title,
          contentSnippet,
          i + 1,
          chapters.length,
        );
  
        const imagePath = path.join(tmpDir, `chapter_${String(i).padStart(3, '0')}.png`);
  
        try {
          const imageBuffer = await this.openaiService.generateImage({
            prompt: imagePrompt,
            size: '1024x1024',
          });
          await fs.writeFile(imagePath, imageBuffer);
        } catch (imgErr: any) {
          console.warn(
            `[Video ${project.id}] Image ${i + 1} échouée (${imgErr.message}), utilisation image de repli`,
          );
          // Générer une image de secours unie avec ffmpeg (évite de bloquer toute la vidéo)
          await execFileAsync('ffmpeg', [
            'C:\\ffmpeg\\bin\\ffmpeg.exe',
            '-f', 'lavfi',
            '-i', `color=c=0x1a1a2e:s=1024x1024:d=1`,
            '-frames:v', '1',
            imagePath,
          ]);
        }
  
        imagePaths.push(imagePath);
      }
  
      // ── Étape 4 : assembler la vidéo avec ffmpeg ─────────────────────────────
      console.log(`[Video ${project.id}] Étape 4/4 — Assemblage vidéo...`);
  
      // Créer le fichier de concaténation d'images (slideshow)
      //   format : « file 'path' \n duration <sec> »
      const concatListPath = path.join(tmpDir, 'concat.txt');
      const concatLines = imagePaths
        .map(p => `file '${p}'\nduration ${secondsPerChapter.toFixed(3)}`)
        .join('\n');
      // Répéter la dernière image pour éviter la coupure finale (bug ffmpeg concat)
      const lastImg = imagePaths[imagePaths.length - 1];
      await fs.writeFile(concatListPath, `${concatLines}\nfile '${lastImg}'\n`);
  
      const outputFileName = `${project.id}.mp4`;
      const outputPath     = path.join(uploadDir, outputFileName);
  
      await execFileAsync(
        'C:\\ffmpeg\\bin\\ffmpeg.exe', // ✅ BON
        [
          '-r',
          '1/4',
          '-i',
          path.join(tmpDir, 'chapter_%03d.png'),
          '-i',
          audioPath,
          '-vf',
          'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-shortest',
          '-y',
          outputPath,
        ]
      );
  
      // ── Nettoyage du dossier temporaire ─────────────────────────────────────
      await fs.rm(tmpDir, { recursive: true, force: true });
  
      // ── Récupérer la taille finale ──────────────────────────────────────────
      const { size: fileSize } = await fs.stat(outputPath);
      const fileUrl = `/uploads/media/${outputFileName}`;
  
      // ── Mettre à jour la BDD ─────────────────────────────────────────────────
      await this.prisma.mediaProject.update({
        where: { id: project.id },
        data: {
          status:      'DONE',
          fileUrl,
          fileSize,
          durationSec: Math.round(totalSeconds),
          completedAt: new Date(),
        },
      });
  
      console.log(
        `[Video ${project.id}] OK | ${chapters.length} chapitres | ${Math.round(totalSeconds)}s | ${(fileSize / 1_048_576).toFixed(1)} MB`,
      );
  
    } catch (err) {
      // Nettoyage même en cas d'erreur
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }
  
  // ─── Helper : prompt d'image DALL-E ─────────────────────────────────────────
  
  private buildImagePrompt(
    bookTitle:     string,
    chapterTitle:  string,
    contentSnippet: string,
    chapterIndex:  number,
    totalChapters: number,
  ): string {
    // Tonalité narrative en fonction de la progression de l'histoire
    const progressRatio = chapterIndex / totalChapters;
    let mood: string;
    if (progressRatio <= 0.2)       mood = 'calm and introductory, soft morning light';
    else if (progressRatio <= 0.5)  mood = 'adventurous and engaging, golden hour light';
    else if (progressRatio <= 0.75) mood = 'tense and dramatic, stormy cinematic light';
    else if (progressRatio <= 0.9)  mood = 'climactic and intense, high-contrast dramatic light';
    else                             mood = 'peaceful and conclusive, warm sunset light';
  
    return [
      `Cinematic digital illustration for a storybook.`,
      `Book: "${bookTitle}".`,
      `Scene: "${chapterTitle}".`,
      contentSnippet ? `Context: ${contentSnippet}.` : '',
      `Mood: ${mood}.`,
      `Style: painterly, detailed, wide establishing shot, no text or watermarks.`,
      `Aspect ratio 1:1, suitable for 16:9 video framing.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // ─── Narration audio ─────────────────────────────────────────────────────

  private async generateAudioNarration(project: any) {
    // Choisir la voix selon le genre demandé
    const voiceMap = {
      FEMALE:  'nova',     // voix féminine, bonne en français
      MALE:    'onyx',     // voix masculine grave
      NEUTRAL: 'alloy',    // voix neutre
    };
    const voice = voiceMap[project.voiceGender] || 'nova';

    console.log('project ',project)
    // Concaténer le contenu de tous les chapitres complets
    const fullText = project.book.chapters
      .map(ch => `Chapitre ${ch.position}. ${ch.title}.\n\n${ch.content || ''}`)
      .join('\n\n---\n\n');
    if (!fullText.trim()) {
      throw new Error('Aucun chapitre complet a narrer');
    }

    // Découper en chunks de ~3500 caractères (limite OpenAI = 4096, on garde une marge)
    const chunks = this.splitTextIntoChunks(fullText, 3500);
    console.log(`[Media ${project.id}] Generation de ${chunks.length} chunks audio...`);

    // Générer chaque chunk audio
    const audioBuffers: Buffer[] = [];
    let totalCost = 0;
    let totalChars = 0;

    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Media ${project.id}] Chunk ${i + 1}/${chunks.length}...`);
      
      const result = await this.openaiService.generateAudio({
        text:        chunks[i],
        voice:       voice as any,
        speed:       1.0,
        highQuality: false, // mettre true pour TTS-1-HD (2x plus cher mais meilleure qualite)
      });

      audioBuffers.push(result.audioBuffer);
      totalCost  += result.estimatedCost;
      totalChars += result.charactersUsed;
    }

    // Concaténer tous les buffers MP3 en un seul fichier
    const finalBuffer = Buffer.concat(audioBuffers);

    // Sauvegarder sur disque (à remplacer par S3 en production)
    const uploadDir = path.join(process.cwd(), 'uploads', 'media');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const fileName = `${project.id}.mp3`;
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, finalBuffer);

    // URL accessible publiquement (à adapter selon ton setup)
    const fileUrl = `/uploads/media/${fileName}`;

    // Estimer la durée approximative (~150 mots/min en lecture, ~5 chars/mot)
    const estimatedSeconds = Math.round((totalChars / 5) / 150 * 60);

    // Mettre à jour le projet en BDD
    await this.prisma.mediaProject.update({
      where: { id: project.id },
      data: {
        status:       'DONE',
        fileUrl,
        fileSize:     finalBuffer.length,
        durationSec:  estimatedSeconds,
        completedAt:  new Date(),
      },
    });

    console.log(
      `[Media ${project.id}] OK | ${totalChars} chars | ${chunks.length} chunks | $${totalCost.toFixed(4)}`,
    );
  }

  // ─── Helper : découpe intelligente du texte ──────────────────────────────

  private splitTextIntoChunks(text: string, maxLen: number): string[] {
    // Découper par paragraphes pour ne pas casser au milieu d'une phrase
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      // Si le paragraphe seul dépasse la limite, le découper par phrases
      if (para.length > maxLen) {
        if (current) { chunks.push(current); current = ''; }
        const sentences = para.split(/(?<=[.!?])\s+/);
        for (const sent of sentences) {
          if ((current + sent).length > maxLen) {
            if (current) chunks.push(current);
            current = sent + ' ';
          } else {
            current += sent + ' ';
          }
        }
      } else if ((current + para).length > maxLen) {
        // Le paragraphe entier ne tient plus → on flush
        chunks.push(current);
        current = para + '\n\n';
      } else {
        current += para + '\n\n';
      }
    }

    if (current.trim()) chunks.push(current);
    return chunks;
  }

  // ─── Lister les projets d'un livre ───────────────────────────────────────

  async findAllForBook(bookId: string, userId: string) {
    await this.checkBookAccess(bookId, userId);

    const projects = await this.prisma.mediaProject.findMany({
      where: { bookId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: projects, total: projects.length };
  }

  // ─── Lister les projets de l'utilisateur ─────────────────────────────────

  async findAllForUser(ownerId: string) {
    const projects = await this.prisma.mediaProject.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: {
        book: { select: { id: true, title: true, coverImageUrl: true } },
      },
    });

    return { data: projects, total: projects.length };
  }

  // ─── Détail d'un projet ───────────────────────────────────────────────────

  async findOne(projectId: string, userId: string) {
    const project = await this.prisma.mediaProject.findUnique({
      where: { id: projectId },
      include: {
        book: { select: { id: true, title: true } },
      },
    });

    if (!project) throw new NotFoundException('Projet multimédia introuvable');

    if (project.ownerId !== userId) {
      await this.checkBookAccess(project.bookId, userId);
    }

    return project;
  }

  // ─── Mettre à jour un projet ──────────────────────────────────────────────

  async update(projectId: string, userId: string, dto: UpdateMediaProjectDto) {
    const project = await this.getProjectOrFail(projectId);
    this.checkOwner(project, userId);

    // Bloquer si en cours de traitement
    if (project.status === 'PROCESSING') {
      throw new BadRequestException(
        'Impossible de modifier un projet en cours de traitement. Attendez la fin de la generation.',
      );
    }

    // Si le projet est terminé, autoriser uniquement la modification du titre
    // (changer la voix ou la langue rendrait les métadonnées incohérentes avec le fichier)
    if (project.status === 'DONE') {
      const allowedFields = ['title'];
      const forbiddenChanges = Object.keys(dto).filter(k => !allowedFields.includes(k));
      
      if (forbiddenChanges.length > 0) {
        throw new BadRequestException(
          `Sur un projet termine, seul le titre peut etre modifie. Pour changer ${forbiddenChanges.join(', ')}, utilisez l'endpoint /regenerate.`,
        );
      }
    }

    const updated = await this.prisma.mediaProject.update({
      where: { id: projectId },
      data:  dto,
    });

    return { message: 'Projet mis a jour', project: updated };
  }

  // ─── Régénérer un projet (avec nouveaux paramètres) ──────────────────────

  async regenerate(projectId: string, userId: string, dto?: UpdateMediaProjectDto) {
    const project = await this.getProjectOrFail(projectId);
    this.checkOwner(project, userId);

    if (project.status === 'PROCESSING') {
      throw new BadRequestException('Une generation est deja en cours.');
    }

    // Appliquer les nouveaux paramètres si fournis (voix, langue, musique...)
    const updated = await this.prisma.mediaProject.update({
      where: { id: projectId },
      data: {
        ...dto,
        status:       'PENDING',
        fileUrl:      null,         // effacer l'ancien fichier de la BDD
        fileSize:     null,
        durationSec:  null,
        error: null,
        completedAt:  null,
      },
    });

    // Optionnel : supprimer l'ancien fichier physique
    if (project.fileUrl) {
      try {
        const oldPath = path.join(process.cwd(), project.fileUrl);
        await fs.unlink(oldPath).catch(() => {}); // on ignore si le fichier n'existe pas
      } catch (err) {
        console.warn(`[Media ${projectId}] Impossible de supprimer l'ancien fichier:`, err);
      }
    }

    // Relancer la génération en arrière-plan
    this.generateMediaInBackground(projectId).catch(err => {
      console.error(`[Media ${projectId}] Echec regeneration:`, err);
    });

    return { message: 'Regeneration lancee, le nouveau fichier sera pret bientot', project: updated };
  }

  // ─── Supprimer un projet ──────────────────────────────────────────────────

  async remove(projectId: string, userId: string) {
    const project = await this.getProjectOrFail(projectId);
    this.checkOwner(project, userId);

    if (project.status === 'PROCESSING') {
      throw new BadRequestException('Impossible de supprimer un projet en cours de traitement');
    }

    await this.prisma.mediaProject.delete({ where: { id: projectId } });

    return { message: 'Projet multimédia supprimé' };
  }

  // ─── Webhook — mise à jour du statut (appelé par le worker) ──────────────

  async updateStatus(
    projectId: string,
    status: 'DONE' | 'FAILED',
    fileUrl?: string,
    durationSec?: number,
    error?: string,
  ) {
    const project = await this.getProjectOrFail(projectId);

    const updated = await this.prisma.mediaProject.update({
      where: { id: projectId },
      data: {
        status,
        fileUrl: fileUrl ?? null,
        durationSec: durationSec ?? null,
        error: error ?? null,
        completedAt: new Date(),
      },
    });

    return { message: `Statut mis à jour : ${status}`, project: updated };
  }

  // ─── Helpers privés ───────────────────────────────────────────────────────

  private async getProjectOrFail(projectId: string) {
    const project = await this.prisma.mediaProject.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Projet multimédia introuvable');
    return project;
  }

  private checkOwner(project: any, userId: string) {
    if (project.ownerId !== userId) {
      throw new ForbiddenException('Seul le propriétaire peut modifier ce projet');
    }
  }

  private async checkBookAccess(bookId: string, userId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, deletedAt: null },
    });
    if (!book) throw new NotFoundException('Livre introuvable');

    if (book.ownerId === userId) return;

    const collab = await this.prisma.collaboration.findUnique({
      where: { bookId_userId: { bookId, userId } },
    });
    if (!collab) throw new ForbiddenException('Accès refusé à ce livre');
  }
}