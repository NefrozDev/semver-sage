import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadEnv } from '@semver-sage/server-core';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app/app.module';

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  // Behind a hosting proxy, rate limits must key on the real client IP (X-Forwarded-For).
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Single-container deployments: also serve the built web app, with SPA fallback to index.html.
  const staticDir = process.env.STATIC_DIR;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.useStaticAssets(staticDir);
    app.use((req: Request, res: Response, next: NextFunction) =>
      req.method === 'GET' && !req.path.startsWith(`/${globalPrefix}`)
        ? res.sendFile(join(staticDir, 'index.html'))
        : next(),
    );
    Logger.log(`Serving web app from ${staticDir}`);
  }
  const port = process.env.PORT || 3000;
  await app.listen(port);
  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
