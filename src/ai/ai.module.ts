import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { PrismaModule } from 'src/prisma.module';
import { OpenAIModule } from 'src/openia/openia.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [PrismaModule, OpenAIModule, NotificationModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
