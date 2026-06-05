import { Module } from '@nestjs/common';
import { BlockchainController } from './blockchain.controller';
import { BlockchainService } from './blockchain.service';
import { PrismaModule } from 'src/prisma.module';
import { BlockchainCron } from './blockchain.cron';
import { PrismaService } from 'src/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [BlockchainController],
  providers: [BlockchainService, BlockchainCron, PrismaService],
  exports: [BlockchainService],
})
export class BlockchainModule {}
