import { Test, TestingModule } from '@nestjs/testing';
import { OpeniaService } from './openia.service';

describe('OpeniaService', () => {
  let service: OpeniaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpeniaService],
    }).compile();

    service = module.get<OpeniaService>(OpeniaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
