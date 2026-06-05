import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import OpenAI from 'openai';

// ─── Types ────────────────────────────────────────────────────────────────

export type SuggestionType =
  | 'CORRECTION'
  | 'NARRATIVE_ADVICE'
  | 'SENTENCE_SUGGESTION'
  | 'CHAPTER_DRAFT'
  | 'BOOK_PLAN'
  | 'COVER_PROMPT';

export interface TextGenInput {
  type:        SuggestionType;
  prompt:      string;
  context?:    string;       // Texte du chapitre ou du livre
  language?:   'fr' | 'en';
  maxTokens?:  number;
}

export interface TextGenResult {
  text:           string;
  tokensInput:    number;
  tokensOutput:   number;
  estimatedCost:  number;    // En USD
  model:          string;
}

export interface ImageGenInput {
  prompt:        string;
  style?:        'vintage' | 'moderne' | 'minimaliste' | 'aquarelle' | 'africain' | 'illustré';
  count?:        number;     // 1 à 4
  size?:         '1024x1024' | '1024x1792' | '1792x1024';
}

export interface ImageGenResult {
  urls:          string[];
  revisedPrompt: string;
  estimatedCost: number;
}

export interface AudioGenInput {
  text:        string;
  voice?:      'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?:      number;       // 0.25 à 4.0
  highQuality?: boolean;     // tts-1-hd vs tts-1
}

export interface AudioGenResult {
  audioBuffer:    Buffer;
  format:         string;
  charactersUsed: number;
  estimatedCost:  number;
}

// ─── Tarifs OpenAI (USD) - à mettre à jour selon platform.openai.com/pricing ─

const PRICING = {
  'gpt-4o-mini':   { input: 0.15  / 1_000_000, output: 0.60  / 1_000_000 },
  'gpt-4o':        { input: 2.50  / 1_000_000, output: 10.00 / 1_000_000 },
  'dall-e-3':      { '1024x1024': 0.040, '1024x1792': 0.080, '1792x1024': 0.080 },
  'tts-1':         15  / 1_000_000,   // par caractère
  'tts-1-hd':      30  / 1_000_000,
};

// ─── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY manquante. Ajoutez-la dans votre fichier .env',
      );
    }
    this.client = new OpenAI({ apiKey });
    this.logger.log('OpenAI client initialise');
  }

  // ════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION DE TEXTE (suggestions, brouillons, plans, corrections)
  // ════════════════════════════════════════════════════════════════════════

  async generateText(input: TextGenInput): Promise<TextGenResult> {
    // GPT-4o pour les tâches créatives complexes, mini sinon
    const useFullModel = ['CHAPTER_DRAFT', 'BOOK_PLAN'].includes(input.type);
    const model        = useFullModel ? 'gpt-4o' : 'gpt-4o-mini';

    const systemPrompt = this.buildSystemPrompt(input.type, input.language ?? 'fr');
    const userPrompt   = this.buildUserPrompt(input);

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: useFullModel ? 0.8 : 0.6,
        max_tokens:  input.maxTokens ?? (useFullModel ? 2000 : 800),
      });

      const text         = response.choices[0]?.message?.content ?? '';
      const tokensInput  = response.usage?.prompt_tokens     ?? 0;
      const tokensOutput = response.usage?.completion_tokens ?? 0;
      const cost         =
        tokensInput  * PRICING[model].input +
        tokensOutput * PRICING[model].output;

      this.logger.log(
        `[Text] ${input.type} | ${model} | ${tokensInput}+${tokensOutput} tokens | $${cost.toFixed(5)}`,
      );

      return {
        text,
        tokensInput,
        tokensOutput,
        estimatedCost: cost,
        model,
      };
    } catch (err: any) {
      this.handleError(err, 'generation de texte');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION DE COUVERTURES (DALL-E 3)
  // ════════════════════════════════════════════════════════════════════════

  async generateBookCovers(input: ImageGenInput): Promise<ImageGenResult> {
    const count = Math.min(Math.max(input.count ?? 1, 1), 4);
    const size  = input.size ?? '1024x1792'; // Format portrait livre

    const stylePrompt = this.buildCoverPrompt(input.prompt, input.style);

    try {
      // DALL-E 3 ne supporte qu'1 image par appel → on fait N appels en parallele
      const requests = Array(count).fill(null).map(() =>
        this.client.images.generate({
          model:           'dall-e-3',
          prompt:          stylePrompt,
          n:               1,
          size:            size as any,
          quality:         'standard',
          style:           'natural',
          response_format: 'url',
        }),
      );

      const responses = await Promise.all(requests);
      const urls          = responses.map(r => r.data?.[0]?.url   ?? '').filter(Boolean);
      const revisedPrompt = responses[0]?.data?.[0]?.revised_prompt ?? stylePrompt;
      const cost          = count * PRICING['dall-e-3'][size];

      this.logger.log(
        `[Cover] ${count} image(s) ${size} | $${cost.toFixed(3)}`,
      );

      return { urls, revisedPrompt, estimatedCost: cost };
    } catch (err: any) {
      this.handleError(err, 'generation de couverture');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // NARRATION AUDIO (TTS)
  // ════════════════════════════════════════════════════════════════════════

  async generateAudio(input: AudioGenInput): Promise<AudioGenResult> {
    if (input.text.length > 4096) {
      throw new BadRequestException(
        'Le texte ne peut pas depasser 4096 caracteres par appel. Decoupez en chunks.',
      );
    }

    const model = input.highQuality ? 'tts-1-hd' : 'tts-1';
    const voice = input.voice ?? 'nova'; // 'nova' = bonne voix feminine en francais

    try {
      const response = await this.client.audio.speech.create({
        model,
        voice,
        input:           input.text,
        speed:           input.speed ?? 1.0,
        response_format: 'mp3',
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      const cost   = input.text.length * PRICING[model];

      this.logger.log(
        `[Audio] ${model} ${voice} | ${input.text.length} chars | $${cost.toFixed(5)}`,
      );

      return {
        audioBuffer:    buffer,
        format:         'mp3',
        charactersUsed: input.text.length,
        estimatedCost:  cost,
      };
    } catch (err: any) {
      this.handleError(err, 'generation audio');
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GÉNÉRATION D'IMAGE (gpt-image-1) → Buffer
  // ────────────────────────────────────────────────────────────────────────────

  async generateImage(input: {
    prompt: string;
    size?: '1024x1024' | '1024x1792' | '1792x1024';
    quality?: 'standard' | 'hd';
  }): Promise<Buffer> {
    const size = input.size ?? '1024x1024';

    // 👉 AJOUT ICI
    const enhancedPrompt = `
    Cinematic illustration, ultra detailed, emotional storytelling scene.
    ${input.prompt}
    Soft lighting, depth of field, high quality, no text, no watermark.
  `;

    try {
      const response = await this.client.images.generate({
        model: 'gpt-image-1',
        prompt: enhancedPrompt, // 👈 on utilise le prompt amélioré
        size: size as any,
      });

      const base64 = response.data?.[0]?.b64_json;

      if (!base64) {
        throw new Error('Aucune image retournée par OpenAI');
      }

      const buffer = Buffer.from(base64, 'base64');

      this.logger.log(`[Image] 1 image ${size}`);

      return buffer;
    } catch (err: any) {
      this.handleError(err, 'generation image');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // HELPERS - Construction de prompts
  // ════════════════════════════════════════════════════════════════════════

  private buildSystemPrompt(type: SuggestionType, language: 'fr' | 'en'): string {
    const lang = language === 'fr' ? 'francais' : 'anglais';
    const base = `Tu es un assistant litteraire expert specialise dans l'autobiographie, la memoire familiale et l'histoire orale africaine. Tu reponds toujours en ${lang}, avec un style sensible, respectueux du patrimoine culturel et chaleureux.`;

    const specific: Record<SuggestionType, string> = {
      CORRECTION: `${base}\n\nTu corriges le style, la grammaire et la syntaxe sans denaturer la voix de l'auteur. Tu listes 2-4 ameliorations concretes et concises.`,
      NARRATIVE_ADVICE: `${base}\n\nTu donnes des conseils narratifs : rythme, structure, profondeur emotionnelle, transitions. Sois concret, propose des pistes precises, evite les generalites.`,
      SENTENCE_SUGGESTION: `${base}\n\nTu proposes une seule phrase ou un court paragraphe (2-4 phrases) qui prolonge naturellement le texte de l'auteur. Respecte sa voix.`,
      CHAPTER_DRAFT: `${base}\n\nTu rediges un brouillon de chapitre complet (800-1500 mots) avec une atmosphere immersive, des details sensoriels et un debut accrocheur. Garde un ton authentique.`,
      BOOK_PLAN: `${base}\n\nTu construis un plan de livre structure : parties, chapitres, themes principaux. Format : Partie I, II, III avec 3-5 chapitres par partie, et un resume d'1-2 phrases par chapitre.`,
      COVER_PROMPT: `${base}\n\nTu generes des descriptions visuelles riches pour des couvertures de livres : ambiance, couleurs, elements symboliques.`,
    };

    return specific[type];
  }

  private buildUserPrompt(input: TextGenInput): string {
    let prompt = input.prompt;
    if (input.context) {
      prompt = `Contexte du livre :\n${input.context.substring(0, 2000)}\n\n---\n\nDemande : ${input.prompt}`;
    }
    return prompt;
  }

  private buildCoverPrompt(userPrompt: string, style?: ImageGenInput['style']): string {
    const styleGuide: Record<NonNullable<ImageGenInput['style']>, string> = {
      vintage:      'vintage book cover, warm earth tones, sepia, hand-drawn elegant typography placeholder, classical composition',
      moderne:      'modern minimalist book cover, clean composition, contemporary typography placeholder, bold simple shapes',
      minimaliste:  'minimalist book cover, single iconic element, lots of negative space, elegant typography placeholder',
      aquarelle:    'soft watercolor illustration book cover, gentle washes of color, organic shapes, dreamy atmosphere',
      africain:     'West African inspired book cover, traditional patterns and textiles, warm ochre and terracotta tones, baobab silhouettes, kente patterns',
      illustré:     'richly illustrated book cover, detailed scene, narrative composition, evocative storytelling',
    };

    const styleStr = style ? styleGuide[style] : styleGuide.vintage;
    return `Book cover design: ${userPrompt}. Style: ${styleStr}. High quality professional book cover, suitable for portrait format, no text or letters in the image. Cinematic composition, beautiful lighting.`;
  }

  // ════════════════════════════════════════════════════════════════════════
  // GESTION D'ERREURS
  // ════════════════════════════════════════════════════════════════════════

  private handleError(err: any, context: string): never {
    const status  = err?.status ?? err?.response?.status;
    const code    = err?.code   ?? err?.error?.code;
    const message = err?.message ?? 'Erreur OpenAI inconnue';

    this.logger.error(`[${context}] ${status} ${code} - ${message}`);

    if (status === 401) throw new InternalServerErrorException('Cle API OpenAI invalide ou expiree.');
    if (status === 429) throw new InternalServerErrorException('Limite de taux OpenAI atteinte. Reessayez dans quelques instants.');
    if (status === 400) throw new BadRequestException(`Requete invalide vers OpenAI : ${message}`);
    if (code === 'insufficient_quota') throw new InternalServerErrorException('Credits OpenAI epuises. Rechargez votre compte sur platform.openai.com');
    if (code === 'content_policy_violation') throw new BadRequestException('Le contenu demande viole les regles d\'OpenAI.');

    throw new InternalServerErrorException(`Erreur lors de la ${context} : ${message}`);
  }
}