import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api/v1')) {
      req.url = req.url.replace(/^\/api\/v1/, '/api');
    }
    next();
  });

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000',
    credentials: true,
  });

  const port =
    config.get<number>('API_PORT') ?? Number(process.env.PORT ?? 3001);
  await app.listen(port);
}
void bootstrap();
