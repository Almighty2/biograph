import { Test, TestingModule } from '@nestjs/testing';
import { WritingStatController } from './writing-stat.controller';

describe('WritingStatController', () => {
  let controller: WritingStatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WritingStatController],
    }).compile();

    controller = module.get<WritingStatController>(WritingStatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
