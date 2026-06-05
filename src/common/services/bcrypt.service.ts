import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class BcryptService {
  private readonly saltRounds = 12;

  /**
   * Hasher un mot de passe
   * @param motDePasse - Mot de passe en clair
   * @returns Hash du mot de passe
   */
  async hash(motDePasse: string): Promise<string> {
    return bcrypt.hash(motDePasse, this.saltRounds);
  }

  /**
   * Hasher un mot de passe (version synchrone)
   * @param motDePasse - Mot de passe en clair
   * @returns Hash du mot de passe
   */
  hashSync(motDePasse: string): string {
    return bcrypt.hashSync(motDePasse, this.saltRounds);
  }

  /**
   * Comparer un mot de passe avec son hash
   * @param motDePasse - Mot de passe en clair
   * @param hash - Hash stocké en base
   * @returns boolean indiquant si le mot de passe correspond
   */
  async compare(motDePasse: string, hash: string): Promise<boolean> {
    return bcrypt.compare(motDePasse, hash);
  }

  /**
   * Comparer un mot de passe avec son hash (version synchrone)
   * @param motDePasse - Mot de passe en clair
   * @param hash - Hash stocké en base
   * @returns boolean indiquant si le mot de passe correspond
   */
  compareSync(motDePasse: string, hash: string): boolean {
    return bcrypt.compareSync(motDePasse, hash);
  }

  /**
   * Générer un salt
   * @returns Salt généré
   */
  async generateSalt(): Promise<string> {
    return bcrypt.genSalt(this.saltRounds);
  }

  /**
   * Générer un salt (version synchrone)
   * @returns Salt généré
   */
  generateSaltSync(): string {
    return bcrypt.genSaltSync(this.saltRounds);
  }

  /**
   * Obtenir le nombre de rounds d'un hash
   * @param hash - Hash à analyser
   * @returns Nombre de rounds
   */
  getRounds(hash: string): number {
    return bcrypt.getRounds(hash);
  }
}