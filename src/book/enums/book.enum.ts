export enum BookGenre {
  AUTOBIOGRAPHY = 'AUTOBIOGRAPHY',
  BIOGRAPHY = 'BIOGRAPHY',
  FAMILY_ARCHIVE = 'FAMILY_ARCHIVE',
  COMMUNITY_HISTORY = 'COMMUNITY_HISTORY',
  MEMOIR = 'MEMOIR',
  OTHER = 'OTHER',
}

export enum BookStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum Visibility {
  PRIVATE = 'PRIVATE',
  RESTRICTED = 'RESTRICTED',
  PUBLIC = 'PUBLIC',
}

export enum ExportFormat {
  PDF = 'PDF',
  EPUB = 'EPUB',
  DOCX = 'DOCX',
}

export enum CollaborationRole {
  READER = 'READER',
  COMMENTER = 'COMMENTER',
  EDITOR = 'EDITOR',
  ADMIN = 'ADMIN',
}