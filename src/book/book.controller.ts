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
import { BookService } from './book.service';
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
import { CreateChapterImageDto, UpdateChapterImageDto } from './dto/create-chapter-image.dto';

@ApiTags('Books')
@ApiBearerAuth()
@Controller('books')
export class BookController {
  constructor(private readonly bookService: BookService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // LIVRES — CRUD
  // ══════════════════════════════════════════════════════════════════════════

  @Post('create')
  @ApiOperation({ summary: 'Créer un nouveau livre' })
  @ApiResponse({ status: 201, description: 'Livre créé' })
  async create(
    @Query('userId') userId: string,
    @Body() dto: CreateBookDto,
  ) {
    return this.bookService.create(userId, dto);
  }

  

  @Get('list')
  @ApiOperation({ summary: 'Lister tous les livres de l\'utilisateur' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.bookService.findAll(userId, page, limit);
  }

  @Get('share/:token')
  @ApiOperation({ summary: 'Accéder à un livre via lien de partage' })
  @ApiParam({ name: 'token', description: 'Token de partage' })
  async accessByShareToken(@Param('token') token: string) {
    return this.bookService.accessByShareToken(token);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Récupérer un livre par son slug' })
  @ApiParam({ name: 'slug', description: 'Slug du livre' })
  async findBySlug(
    @Param('slug') slug: string,
    @Query('userId') userId?: string,
  ) {
    return this.bookService.findBySlug(slug, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un livre par ID (avec chapitres, TDM, collaborateurs)' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'userId', required: true })
  async findOne(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un livre' })
  @ApiParam({ name: 'id' })
  async update(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateBookDto,
  ) {
    return this.bookService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un livre (soft delete)' })
  @ApiParam({ name: 'id' })
  async remove(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.remove(id, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Actions sur le statut
  // ──────────────────────────────────────────────────────────────────────────

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publier un livre' })
  async publish(@Param('id') id: string, @Query('userId') userId: string) {
    return this.bookService.publish(id, userId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archiver un livre' })
  async archive(@Param('id') id: string, @Query('userId') userId: string) {
    return this.bookService.archive(id, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Visibilité & partage
  // ──────────────────────────────────────────────────────────────────────────

  @Patch(':id/visibility')
  @ApiOperation({ summary: 'Changer la visibilité du livre (génère un lien de partage si RESTRICTED)' })
  async updateVisibility(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    return this.bookService.updateVisibility(id, userId, dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHAPITRES
  // ══════════════════════════════════════════════════════════════════════════

  @Post(':id/chapters')
  @ApiOperation({ summary: 'Ajouter un chapitre au livre' })
  @ApiParam({ name: 'id', description: 'ID du livre' })
  async createChapter(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: CreateChapterDto,
  ) {
    return this.bookService.createChapter(bookId, userId, dto);
  }

  @Patch(':id/chapters/:chapterId')
  @ApiOperation({ summary: 'Mettre à jour un chapitre' })
  @ApiParam({ name: 'id', description: 'ID du livre' })
  @ApiParam({ name: 'chapterId' })
  async updateChapter(
    @Param('id') bookId: string,
    @Param('chapterId') chapterId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.bookService.updateChapter(bookId, chapterId, userId, dto);
  }

  @Delete(':id/chapters/:chapterId')
  @ApiOperation({ summary: 'Supprimer un chapitre' })
  async deleteChapter(
    @Param('id') bookId: string,
    @Param('chapterId') chapterId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.deleteChapter(bookId, chapterId, userId);
  }

  @Patch(':id/chapters/2/reorder')
  @ApiOperation({ summary: 'Réordonner les chapitres' })
  @ApiParam({ name: 'id' })
  async reorderChapters(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
    @Body() order: { id: string; position: number }[],
  ) {
    return this.bookService.reorderChapters(bookId, userId, order);
  }

  //IMAGE CHAPITRE
  @Post(':bookId/chapters/:chapterId/images')
  @ApiOperation({ summary: 'Ajouter une image à un chapitre' })
  @ApiParam({ name: 'bookId', description: 'ID du livre' })
  @ApiParam({ name: 'chapterId', description: 'ID du chapitre' })
  @ApiResponse({ status: 201, description: 'Image ajoutée' })
  @ApiResponse({ status: 404, description: 'Livre ou chapitre introuvable' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async createChapterImage(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Query('userId') userId: string,
    @Body() dto: CreateChapterImageDto,
  ) {
    return this.bookService.createChapterImage(bookId, chapterId, userId, dto);
  }

  @Get(':bookId/chapters/:chapterId/images')
  @ApiOperation({ summary: "Lister toutes les images d'un chapitre" })
  @ApiParam({ name: 'bookId' })
  @ApiParam({ name: 'chapterId' })
  async findAllChapterImage(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.findAllChapterImage(bookId, chapterId, userId);
  }
 
  @Patch(':bookId/chapters/:chapterId/images/reorder')
  @ApiOperation({ summary: 'Réordonner les images du chapitre' })
  @ApiParam({ name: 'bookId' })
  @ApiParam({ name: 'chapterId' })
  async reorderChapterImage(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Query('userId') userId: string,
    @Body() order: { id: string; position: number }[],
  ) {
    return this.bookService.reorderChapterImage(bookId, chapterId, userId, order);
  }
 
  @Patch(':bookId/chapters/:chapterId/images/:imageId')
  @ApiOperation({ summary: "Mettre à jour une image (légende, position, alt text)" })
  @ApiParam({ name: 'bookId' })
  @ApiParam({ name: 'chapterId' })
  @ApiParam({ name: 'imageId', description: "ID de l'image" })
  @ApiResponse({ status: 200, description: 'Image mise à jour' })
  @ApiResponse({ status: 404, description: 'Image introuvable' })
  async updateChapterImage(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Param('imageId') imageId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateChapterImageDto,
  ) {
    return this.bookService.updateChapterImage(bookId, chapterId, imageId, userId, dto);
  }
 
  @Delete(':bookId/chapters/:chapterId/images/:imageId')
  @ApiOperation({ summary: "Supprimer une image d'un chapitre" })
  @ApiParam({ name: 'bookId' })
  @ApiParam({ name: 'chapterId' })
  @ApiParam({ name: 'imageId' })
  @ApiResponse({ status: 200, description: 'Image supprimée' })
  async removeChapterImage(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Param('imageId') imageId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.removeChapterImage(bookId, chapterId, imageId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SOUS-CHAPITRES
  // ══════════════════════════════════════════════════════════════════════════

  @Post(':id/chapters/:chapterId/sub-chapters')
  @ApiOperation({ summary: 'Ajouter un sous-chapitre' })
  async createSubChapter(
    @Param('id') bookId: string,
    @Param('chapterId') chapterId: string,
    @Query('userId') userId: string,
    @Body() dto: CreateSubChapterDto,
  ) {
    return this.bookService.createSubChapter(bookId, chapterId, userId, dto);
  }

  @Patch(':id/chapters/:chapterId/sub-chapters/:subChapterId')
  @ApiOperation({ summary: 'Mettre à jour un sous-chapitre' })
  async updateSubChapter(
    @Param('id') bookId: string,
    @Param('chapterId') chapterId: string,
    @Param('subChapterId') subChapterId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateSubChapterDto,
  ) {
    return this.bookService.updateSubChapter(bookId, chapterId, subChapterId, userId, dto);
  }

  @Delete(':id/chapters/:chapterId/sub-chapters/:subChapterId')
  @ApiOperation({ summary: 'Supprimer un sous-chapitre' })
  async deleteSubChapter(
    @Param('id') bookId: string,
    @Param('chapterId') chapterId: string,
    @Param('subChapterId') subChapterId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.deleteSubChapter(bookId, chapterId, subChapterId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLLABORATIONS
  // ══════════════════════════════════════════════════════════════════════════

  @Get(':id/collaborators')
  @ApiOperation({ summary: 'Lister les collaborateurs du livre' })
  async getCollaborators(@Param('id') bookId: string) {
    return this.bookService.getCollaborators(bookId);
  }

  @Post(':id/collaborators')
  @ApiOperation({ summary: 'Inviter un collaborateur par email' })
  async inviteCollaborator(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: InviteCollaboratorDto,
  ) {
    return this.bookService.inviteCollaborator(bookId, userId, dto);
  }

  @Patch(':id/collaborators/:collaboratorId/role')
  @ApiOperation({ summary: 'Changer le rôle d\'un collaborateur' })
  async updateCollaboratorRole(
    @Param('id') bookId: string,
    @Param('collaboratorId') collaboratorId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateCollaboratorRoleDto,
  ) {
    return this.bookService.updateCollaboratorRole(bookId, userId, collaboratorId, dto);
  }

  @Delete(':id/collaborators/:collaboratorId')
  @ApiOperation({ summary: 'Retirer un collaborateur' })
  async removeCollaborator(
    @Param('id') bookId: string,
    @Param('collaboratorId') collaboratorId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.removeCollaborator(bookId, userId, collaboratorId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VERSIONS
  // ══════════════════════════════════════════════════════════════════════════

  @Get(':id/versions')
  @ApiOperation({ summary: 'Lister les versions sauvegardées' })
  async getVersions(
    @Param('id') bookId: string,
  ) {
    return this.bookService.getVersions(bookId);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Sauvegarder une version (snapshot)' })
  async createVersion(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: CreateVersionDto,
  ) {
    return this.bookService.createVersion(bookId, userId, dto);
  }

  @Post(':id/versions/:versionId/restore')
  @ApiOperation({ summary: 'Restaurer une version antérieure' })
  async restoreVersion(
    @Param('id') bookId: string,
    @Param('versionId') versionId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.restoreVersion(bookId, versionId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ══════════════════════════════════════════════════════════════════════════

  @Get(':id/exports')
  @ApiOperation({ summary: 'Lister les exports d\'un livre' })
  async getExports(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.getExports(bookId, userId);
  }

  @Post(':id/exports')
  @ApiOperation({ summary: 'Lancer un export (PDF, EPUB, DOCX)' })
  async requestExport(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: ExportBookDto,
  ) {
    return this.bookService.requestExport(bookId, userId, dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TABLE DES MATIÈRES
  // ══════════════════════════════════════════════════════════════════════════

  @Post(':id/table-of-contents')
  @ApiOperation({ summary: 'Générer / régénérer la table des matières' })
  async generateTableOfContents(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.generateTableOfContents(bookId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAGS
  // ══════════════════════════════════════════════════════════════════════════

  @Post(':id/tags')
  @ApiOperation({ summary: 'Ajouter des tags au livre' })
  async addTags(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: AddTagsDto,
  ) {
    return this.bookService.addTags(bookId, userId, dto);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Retirer un tag du livre' })
  async removeTag(
    @Param('id') bookId: string,
    @Param('tagId') tagId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.removeTag(bookId, tagId, userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FAVORIS
  // ══════════════════════════════════════════════════════════════════════════

  @Get('user/favorites')
  @ApiOperation({ summary: 'Lister les favoris de l\'utilisateur' })
  async getFavorites(@Query('userId') userId: string) {
    return this.bookService.getFavorites(userId);
  }

  @Post(':id/favorites')
  @ApiOperation({ summary: 'Ajouter un livre (ou chapitre) aux favoris' })
  async addFavorite(
    @Param('id') bookId: string,
    @Query('userId') userId: string,
    @Body() dto: AddFavoriteDto,
  ) {
    return this.bookService.addFavorite(bookId, userId, dto);
  }

  @Delete(':id/favorites/:favoriteId')
  @ApiOperation({ summary: 'Retirer des favoris' })
  async removeFavorite(
    @Param('id') bookId: string,
    @Param('favoriteId') favoriteId: string,
    @Query('userId') userId: string,
  ) {
    return this.bookService.removeFavorite(bookId, userId, favoriteId);
  }
}