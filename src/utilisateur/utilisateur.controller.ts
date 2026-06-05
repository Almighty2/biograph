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
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { UtilisateurService } from './utilisateur.service';
import { VerifyAccountDto } from './dto/verify-account.dto';

@ApiTags('Users')
@Controller('users')
export class UtilisateurController {
  constructor(private readonly userService: UtilisateurService) {}

  // ─── Authentification ──────────────────────────────────────────────────────

  @Post('register')
  @ApiOperation({ summary: 'Créer un compte utilisateur' })
  @ApiResponse({ status: 201, description: 'Compte créé avec succès' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  async register(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Se connecter' })
  @ApiResponse({ status: 200, description: 'Connexion réussie, retourne un token' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  async login(@Body() dto: LoginUserDto) {
    return this.userService.login(dto);
  }

  @Post('verify-account')
  @ApiOperation({ summary: 'Vérifier le compte via token reçu par email' })
  @ApiResponse({ status: 200, description: 'Compte vérifié avec succès' })
  @ApiResponse({ status: 400, description: 'Token invalide ou expiré' })
  async verifyAccount(@Body() dto: VerifyAccountDto) {
    return this.userService.verifyAccount(dto);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Renvoyer l\'email de vérification' })
  @ApiResponse({ status: 200, description: 'Email renvoyé si le compte existe' })
  async resendVerification(@Body() dto: ForgotPasswordDto) { // réutilise { email }
    return this.userService.resendVerification(dto.email);
  }

  @Get('verify-account')
  @ApiOperation({ summary: 'Vérifier le compte via token reçu par email' })
  @ApiResponse({ status: 200, description: 'Compte vérifié avec succès' })
  @ApiResponse({ status: 400, description: 'Token invalide ou expiré' })
  async verifyAccounts(@Query('token') token: string) {
    return this.userService.verifyAccounts(token);
  }

  @Post('logout/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Se déconnecter' })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur" })
  async logout(@Param('id') id: string) {
    return this.userService.logout(id);
  }

  // ─── Mot de passe ──────────────────────────────────────────────────────────

  @Post('forgot-password')
  @ApiOperation({ summary: 'Demander un lien de réinitialisation du mot de passe' })
  @ApiResponse({ status: 200, description: 'Email envoyé si le compte existe' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.userService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Réinitialiser le mot de passe via token' })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé' })
  @ApiResponse({ status: 400, description: 'Token invalide ou expiré' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto);
  }

  @Get('reset-password')
  @ApiOperation({ summary: 'Valider le token de réinitialisation' })
  async validateResetToken(@Query('token') token: string) {
    return this.userService.validateResetToken(token);
  }

  @Patch(':id/change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer son mot de passe (connecté)' })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Mot de passe modifié' })
  @ApiResponse({ status: 401, description: 'Mot de passe actuel incorrect' })
  async changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(id, dto);
  }

  

  // ─── CRUD Utilisateurs ─────────────────────────────────────────────────────

  @Get('all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister tous les utilisateurs (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.userService.findAll(page, limit);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer un utilisateur par ID' })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Utilisateur trouvé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour le profil' })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un compte (soft delete)' })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Compte supprimé' })
  async remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}