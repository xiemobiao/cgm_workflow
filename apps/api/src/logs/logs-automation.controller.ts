import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AssertionRuleType, AssertionRunStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LogsAssertionService } from './services/logs-assertion.service';
import { LogsRegressionService } from './services/logs-regression.service';

const thresholdSchema = z.object({
  qualityScoreDropMax: z.number().min(0).optional(),
  errorRateIncreaseMax: z.number().min(0).optional(),
  errorEventsIncreaseMax: z.number().min(0).optional(),
  warningEventsIncreaseMax: z.number().min(0).optional(),
  sessionCountDropMax: z.number().min(0).optional(),
  deviceCountDropMax: z.number().min(0).optional(),
});

const createBaselineSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  thresholds: thresholdSchema.optional(),
});

const listBaselinesSchema = z.object({
  projectId: z.string().uuid(),
  isActive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const compareSchema = z
  .object({
    projectId: z.string().uuid(),
    targetLogFileId: z.string().uuid(),
    baselineId: z.string().uuid().optional(),
    baselineLogFileId: z.string().uuid().optional(),
    thresholds: thresholdSchema.optional(),
  })
  .refine((v) => !!v.baselineId || !!v.baselineLogFileId, {
    message: 'baselineId or baselineLogFileId is required',
  });

const trendSchema = z
  .object({
    projectId: z.string().uuid(),
    baselineId: z.string().uuid().optional(),
    baselineLogFileId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((v) => !!v.baselineId || !!v.baselineLogFileId, {
    message: 'baselineId or baselineLogFileId is required',
  });

const createRuleSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  ruleType: z.nativeEnum(AssertionRuleType),
  definition: z.record(z.string(), z.unknown()),
  enabled: z.coerce.boolean().optional(),
  priority: z.coerce.number().int().min(1).max(1000).optional(),
});

const listRulesSchema = z.object({
  projectId: z.string().uuid(),
  enabled: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const installDefaultsSchema = z.object({
  projectId: z.string().uuid(),
});

const validateSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid(),
  ruleIds: z.array(z.string().uuid()).min(1).max(200).optional(),
  triggeredBy: z.enum(['manual', 'auto', 'ci']).optional(),
});

const listRunsSchema = z.object({
  projectId: z.string().uuid(),
  logFileId: z.string().uuid().optional(),
  status: z.nativeEnum(AssertionRunStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const runDetailSchema = z.object({
  projectId: z.string().uuid(),
});

const idSchema = z.string().uuid();

@UseGuards(JwtAuthGuard)
@Controller('logs')
export class LogsAutomationController {
  constructor(
    private readonly regression: LogsRegressionService,
    private readonly assertion: LogsAssertionService,
  ) {}

  @Post('regression/baselines')
  @HttpCode(200)
  async createBaseline(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = createBaselineSchema.parse(body);
    return this.regression.createBaseline({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get('regression/baselines')
  async listBaselines(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = listBaselinesSchema.parse(query);
    return this.regression.listBaselines({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Post('regression/compare')
  @HttpCode(200)
  async compare(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = compareSchema.parse(body);
    return this.regression.compareWithBaseline({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get('regression/trend')
  async regressionTrend(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = trendSchema.parse(query);
    return this.regression.getRegressionTrend({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Post('assertions/rules')
  @HttpCode(200)
  async createRule(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = createRuleSchema.parse(body);
    return this.assertion.createRule({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get('assertions/rules')
  async listRules(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = listRulesSchema.parse(query);
    return this.assertion.listRules({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Post('assertions/rules/install-defaults')
  @HttpCode(200)
  async installDefaultRules(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = installDefaultsSchema.parse(body);
    return this.assertion.installDefaultRules({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Post('assertions/validate')
  @HttpCode(200)
  async validateRules(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = validateSchema.parse(body);
    return this.assertion.runValidation({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get('assertions/runs')
  async listRuns(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: unknown,
  ) {
    const dto = listRunsSchema.parse(query);
    return this.assertion.listRuns({
      actorUserId: user.userId,
      ...dto,
    });
  }

  @Get('assertions/runs/:runId')
  async getRun(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId') runId: string,
    @Query() query: unknown,
  ) {
    const runIdParsed = idSchema.parse(runId);
    const dto = runDetailSchema.parse(query);
    return this.assertion.getRun({
      actorUserId: user.userId,
      projectId: dto.projectId,
      runId: runIdParsed,
    });
  }
}
