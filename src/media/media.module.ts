import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PrismaModule } from 'src/prisma.module';
import { OpenAIModule } from 'src/openia/openia.module';

@Module({
  imports: [PrismaModule,OpenAIModule],
  controllers: [MediaController],
  providers: [MediaService]
})
export class MediaModule {}
