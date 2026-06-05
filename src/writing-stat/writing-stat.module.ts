import { Module } from '@nestjs/common';
import { WritingStatController } from './writing-stat.controller';
import { WritingStatService } from './writing-stat.service';
import { PrismaModule } from 'src/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WritingStatController],
  providers: [WritingStatService]
})
export class WritingStatModule {}
