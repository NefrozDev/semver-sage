import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AskController } from './ask/ask.controller';
import { AskService } from './ask/ask.service';
import { DatabaseService } from './database.service';
import { llmProvider } from './llm';
import { RetrievalService } from './retrieval/retrieval.service';

@Module({
  imports: [
    // Protects free-tier LLM quotas on a public demo: questions per client IP per minute.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env['ASK_RATE_LIMIT']) || 20 }]),
  ],
  controllers: [AskController],
  providers: [DatabaseService, RetrievalService, AskService, llmProvider],
})
export class AppModule {}
