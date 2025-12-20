import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';

@Module({
  imports: [IntegrationsModule, WorkflowsModule],
  controllers: [RequirementsController],
  providers: [RequirementsService],
})
export class RequirementsModule {}
