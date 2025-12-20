import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { envSchema } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { RbacModule } from './rbac/rbac.module';
import { ProjectsModule } from './projects/projects.module';
import { TemplatesModule } from './templates/templates.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { RequirementsModule } from './requirements/requirements.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { StorageModule } from './storage/storage.module';
import { LogsModule } from './logs/logs.module';
import { IncidentsModule } from './incidents/incidents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (config) => envSchema.parse(config),
    }),
    DatabaseModule,
    StorageModule,
    AuthModule,
    RbacModule,
    AuditModule,
    ProjectsModule,
    TemplatesModule,
    IntegrationsModule,
    WorkflowsModule,
    RequirementsModule,
    ArtifactsModule,
    PipelinesModule,
    LogsModule,
    IncidentsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
