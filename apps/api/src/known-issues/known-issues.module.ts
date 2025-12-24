import { Module } from '@nestjs/common';
import { KnownIssuesController, ReportsController } from './known-issues.controller';
import { KnownIssuesService } from './known-issues.service';

@Module({
  controllers: [KnownIssuesController, ReportsController],
  providers: [KnownIssuesService],
  exports: [KnownIssuesService],
})
export class KnownIssuesModule {}
