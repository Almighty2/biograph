import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from 'src/prisma.service';
import { buildMailTemplate } from 'src/mailtemplates/mail.templates';
import { NotificationService } from 'src/notification/notification.service';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class UtilisateurService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── Inscription ──────────────────────────────────────────────────────────

  async create(dto: CreateUserDto) {
    const BASE_URL = 'https://biograph-3.onrender.com/api/v1';
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Un compte avec cet email existe déjà');
    }

    // Extraire prenom/nom AVANT la création (depuis dto, pas depuis user)
    const parts = (dto.fullName ?? '').trim().split(' ');
    const prenom = parts[0] || dto.email.split('@')[0];
    const nom = parts.length > 1 ? parts.slice(1).join(' ') : 'Synergy Biograf';

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const code = await this.generateUserCode();
    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.prisma.user.create({ 
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        language: dto.language ?? 'fr',
        timezone: dto.timezone ?? 'Africa/Abidjan',
        code,
        isVerified: false,
        verificationToken: token,
        verificationTokenExpiry: expiry,
      },
      select: this.safeSelect(),
    });
    console.log('prenom ',prenom)
    console.log('nom ',nom)
    const { subject, html } = buildMailTemplate({
      type: 'create_account',
      prenom,
      nom,
      actionUrl: `${BASE_URL}/verify-account?token=${token}`,
    });

    await this.notificationService.sendMail(user.email, subject, html);

    return { message: 'Compte créé avec succès', user };
  }

  // ─── Connexion ────────────────────────────────────────────────────────────

  async login(dto: LoginUserDto) {
    const { email, password } = dto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Ce compte a été supprimé');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Veuillez vérifier votre compte via le lien envoyé par email');
    }

    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.upsert({
      where: { userId: user.id },
      update: { token, expiresAt, lastUsedAt: new Date() },
      create: { userId: user.id, token, expiresAt },
    });

    const { passwordHash: _, ...safeUser } = user;

    return { message: 'Connexion réussie', token, user: safeUser };
  }

  // ─── Déconnexion ──────────────────────────────────────────────────────────

  async logout(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
    return { message: 'Déconnexion réussie' };
  }

  // ─── Récupérer tous les utilisateurs ──────────────────────────────────────

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: this.safeSelect(),
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Récupérer un utilisateur par ID ──────────────────────────────────────

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.safeSelect(),
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');

    return user;
  }

  // ─── Mettre à jour le profil ──────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: this.safeSelect(),
    });

    return { message: 'Profil mis à jour', user };
  }

  // ─── Changer le mot de passe ──────────────────────────────────────────────

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.passwordHash) throw new NotFoundException('Utilisateur introuvable');

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Mot de passe actuel incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    return { message: 'Mot de passe modifié avec succès' };
  }

  // ─── Mot de passe oublié ──────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new NotFoundException('Aucun compte associé à cet email');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiresAt: expiresAt },
    });

    console.log('user ',user)
    // Réinitialisation de mot de passe

    const fullName = user.fullName || '';
    const parts = fullName.trim().split(' ');

    const prenom = parts[0] || user.email.split('@')[0];
    const nom = parts.length > 1 ? parts.slice(1).join(' ') : 'Synergy Biograf';

    const { subject, html } = buildMailTemplate({
      type: 'reset_password',
      prenom,
      nom,
      actionUrl: `${process.env.FRONTEND_URL}/users/reset-password?token=${token}`, // ✅ backticks
    });

  await this.notificationService.sendMail(user.email, subject, html);

    return { message: 'Lien de réinitialisation a été envoyé' };
  }

  async verifyAccount(dto: VerifyAccountDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        verificationToken: dto.token,
        verificationTokenExpiry: { gte: new Date() },
        isVerified: false,
      },
    });

    if (!user) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return { success: true, message: 'Compte vérifié avec succès' };
  }

  async verifyAccounts(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpiry: { gte: new Date() },
        isVerified: false,
      },
    });

    if (!user) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return { success: true, message: 'Compte vérifié avec succès' };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Toujours répondre 200 pour ne pas exposer les emails existants
    if (!user || user.isVerified) {
      return { success: true, message: 'Email envoyé si le compte existe' };
    }

    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: token, verificationTokenExpiry: expiry },
    });

    const fullName = user.fullName || '';
    const parts = fullName.trim().split(' ');

    const prenom = parts[0] || user.email.split('@')[0];
    const nom = parts.length > 1 ? parts.slice(1).join(' ') : 'Synergy Biograf';

    const { subject, html } = buildMailTemplate({
      type: 'create_account',
      prenom,
      nom,
      actionUrl: `${process.env.FRONTEND_URL}/verify-account?token=${token}`,
    });

    await this.notificationService.sendMail(user.email, subject, html);

    return { success: true, message: 'Email envoyé si le compte existe' };
  }

  // ─── Réinitialiser le mot de passe ────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: dto.token,
        resetTokenExpiresAt: { gt: new Date() },
      },
    });

    if (!user) throw new BadRequestException('Token invalide ou expiré');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
    });

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  async validateResetToken(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiresAt: { gte: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    return { valid: true, message: 'Token valide' };
  }

  // ─── Supprimer un compte (soft delete) ────────────────────────────────────

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Compte supprimé avec succès' };
  }

  // ─── Helpers privés ───────────────────────────────────────────────────────

  private safeSelect() {
    return {
      id: true,
      email: true,
      emailVerified: true,
      fullName: true,
      avatarUrl: true,
      bio: true,
      language: true,
      timezone: true,
      plan: true,
      planExpiresAt: true,
      code: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private async generateUserCode(): Promise<string> {
    const count = await this.prisma.user.count();
    return `USR${String(count + 1).padStart(6, '0')}`;
  }
}