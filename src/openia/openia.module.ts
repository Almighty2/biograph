import { Module } from '@nestjs/common';
import { OpeniaController } from './openia.controller';
import { OpenAIService } from './openia.service';
import { PrismaModule } from 'src/prisma.module';

@Module({
  imports: [OpenAIModule],
  controllers: [OpeniaController],
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
