import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPool, getConfig } from '@semver-sage/server-core';
import type { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool = createPool(getConfig().databaseUrl);

  onModuleDestroy() {
    return this.pool.end();
  }
}
