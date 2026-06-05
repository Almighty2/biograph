import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlockchainService } from './blockchain.service';

@Injectable()
export class BlockchainCron {
  private readonly logger = new Logger(BlockchainCron.name);

  constructor(private readonly blockchainService: BlockchainService) {}

  // Verifie les confirmations Bitcoin toutes les heures
  @Cron(CronExpression.EVERY_HOUR)
  async checkConfirmations() {
    this.logger.log('Verification des confirmations blockchain en cours...');
    try {
      await this.blockchainService.checkPendingConfirmations();
    } catch (err: any) {
      this.logger.error(`Erreur cron: ${err.message}`);
    }
  }
}