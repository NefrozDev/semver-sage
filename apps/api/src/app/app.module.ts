import { Module } from '@nestjs/common';
import { AskController } from './ask/ask.controller';
import { AskService } from './ask/ask.service';
import { DatabaseService } from './database.service';
import { RetrievalService } from './retrieval/retrieval.service';

@Module({
  imports: [],
  controllers: [AskController],
  providers: [DatabaseService, RetrievalService, AskService],
})
export class AppModule {}
