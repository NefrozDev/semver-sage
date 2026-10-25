import { BadRequestException, Body, Controller, Get, Post, Res } from '@nestjs/common';
import { AskRequest, AskStreamEvent, isFramework, parseVersion } from '@semver-sage/types';
import type { Response } from 'express';
import { DatabaseService } from '../database.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { AskService } from './ask.service';

function validate(body: unknown): AskRequest {
  const { question, framework, version, compareVersion } = (body ?? {}) as Record<string, unknown>;
  if (typeof question !== 'string' || !question.trim() || question.length > 1000) {
    throw new BadRequestException('question must be a non-empty string of at most 1000 characters');
  }
  if (framework !== undefined && framework !== null && !isFramework(framework)) {
    throw new BadRequestException(`unknown framework: ${String(framework)}`);
  }
  for (const [name, value] of [['version', version], ['compareVersion', compareVersion]] as const) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || !parseVersion(value))) {
      throw new BadRequestException(`invalid ${name}: ${String(value)}`);
    }
  }
  if (compareVersion && !framework) {
    throw new BadRequestException('compareVersion needs a framework');
  }
  return {
    question: question.trim(),
    framework: (framework as AskRequest['framework'] | null) ?? undefined,
    version: (version as string | null) ?? undefined,
    compareVersion: (compareVersion as string | null) ?? undefined,
  };
}

@Controller()
export class AskController {
  constructor(
    private readonly askService: AskService,
    private readonly retrieval: RetrievalService,
    private readonly db: DatabaseService,
  ) {}

  /** Answers a question as a Server-Sent Events stream of `AskStreamEvent`s. */
  @Post('ask')
  async ask(@Body() body: unknown, @Res() res: Response) {
    const request = validate(body);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const send = (event: AskStreamEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    try {
      for await (const event of this.askService.ask(request, abort.signal)) {
        if (abort.signal.aborted) break;
        send(event);
      }
    } catch (err) {
      send({ type: 'error', message: (err as Error).message });
    } finally {
      res.end();
    }
  }

  @Get('versions')
  versions() {
    return this.retrieval
      .indexedVersions()
      .then((rows) => rows.map(({ versionNum, ...v }) => v));
  }

  @Get('health')
  async health() {
    await this.db.pool.query('SELECT 1');
    return { status: 'ok', llm: this.askService.llmName };
  }
}
