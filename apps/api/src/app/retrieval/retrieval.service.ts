import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Embedder, getConfig, Reranker, Retriever, SearchScope } from '@semver-sage/server-core';
import type { Citation } from '@semver-sage/types';
import { DatabaseService } from '../database.service';

/** Nest wrapper around the shared Retriever (also used by the evals). */
@Injectable()
export class RetrievalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly config = getConfig();
  private readonly embedder = new Embedder(this.config.embeddingModel, this.config.modelCacheDir);
  private readonly reranker = this.config.rerankEnabled
    ? new Reranker(this.config.rerankerModel, this.config.modelCacheDir)
    : null;
  private readonly retriever: Retriever;

  constructor(db: DatabaseService) {
    this.retriever = new Retriever(db.pool, this.embedder, this.reranker, (msg) => this.logger.warn(msg));
  }

  /** Loads models in the background so the first question isn't slow. */
  onApplicationBootstrap() {
    this.embedder.warmUp().catch((err) => this.logger.error(`Embedder failed to load: ${err}`));
    this.reranker?.warmUp().catch((err) => this.logger.error(`Reranker failed to load: ${err}`));
  }

  indexedVersions() {
    return this.retriever.indexedVersions();
  }

  search(question: string, scope: SearchScope, topK?: number): Promise<Citation[]> {
    return this.retriever.search(question, scope, { topK });
  }
}
