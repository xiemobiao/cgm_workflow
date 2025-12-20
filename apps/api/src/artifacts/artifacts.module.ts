import { Module } from '@nestjs/common';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ArtifactsController } from './artifacts.controller';

@Module({
  imports: [WorkflowsModule],
  controllers: [ArtifactsController],
})
export class ArtifactsModule {}
