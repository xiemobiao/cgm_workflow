import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // Swagger API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CGM Workflow API')
    .setDescription('CGM SDK Debug Platform API - 日志分析、问题诊断与事故追踪')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT-auth',
    )
    .addTag('logs', 'Log file and event operations')
    .addTag('bluetooth', 'Bluetooth debugging and session analysis')
    .addTag('incidents', 'Incident management')
    .addTag('known-issues', 'Known issues library')
    .addTag('auth', 'Authentication')
    .addTag('projects', 'Project management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'CGM Workflow API Docs',
  });

  app.enableCors({
    origin: config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000',
    credentials: true,
  });

  const port =
    config.get<number>('API_PORT') ?? Number(process.env.PORT ?? 3001);
  await app.listen(port);

  console.log(`🚀 API is running on: http://localhost:${port}`);
  console.log(
    `📚 Swagger docs available at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
