import { Test, TestingModule } from '@nestjs/testing';
import { WritingStatService } from './writing-stat.service';

describe('WritingStatService', () => {
  let service: WritingStatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WritingStatService],
    }).compile();

    service = module.get<WritingStatService>(WritingStatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
