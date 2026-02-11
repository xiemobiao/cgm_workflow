import { Injectable } from '@nestjs/common';
import { AssertionRuleType, AssertionRunStatus, Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { LogsHelperService } from './logs-helper.service';

type GroupByField = 'linkCode' | 'attemptId' | 'deviceMac' | 'requestId';

type BaseRuleDefinition = {
  startTime?: string;
  endTime?: string;
  levelGte?: number;
};

type EventMustExistDefinition = BaseRuleDefinition & {
  eventName: string;
  minCount: number;
};

type EventMustNotExistDefinition = BaseRuleDefinition & {
  eventName: string;
  maxCount: number;
};

type EventAfterAnchorDefinition = BaseRuleDefinition & {
  anchorEventName: string;
  targetEventName: string;
  groupBy: GroupByField;
  windowMs: number;
  allowMissed: number;
};

type NormalizedDefinition =
  | EventMustExistDefinition
  | EventMustNotExistDefinition
  | EventAfterAnchorDefinition;

type RuleEvaluationResult = {
  ruleId: string;
  ruleName: string;
  ruleType: AssertionRuleType;
  passed: boolean;
  message: string;
  actual: Record<string, number | string | null>;
  expected: Record<string, number | string | null>;
  sampleEventIds: string[];
};

type DefaultAssertionTemplate = {
  name: string;
  description: string;
  ruleType: AssertionRuleType;
  priority: number;
  definition: Record<string, unknown>;
};

const DEFAULT_ASSERTION_TEMPLATES: DefaultAssertionTemplate[] = [
  {
    name: '[default] parser_error_must_be_zero',
    description: '解析日志后不应出现 PARSER_ERROR 事件',
    ruleType: AssertionRuleType.event_must_not_exist,
    priority: 10,
    definition: {
      eventName: 'PARSER_ERROR',
      maxCount: 0,
    },
  },
  {
    name: '[default] sdk_init_success_must_exist',
    description: '日志中至少应包含一次 SDK init success',
    ruleType: AssertionRuleType.event_must_exist,
    priority: 20,
    definition: {
      eventName: 'SDK init success',
      minCount: 1,
    },
  },
  {
    name: '[default] ble_scan_start_must_exist',
    description: '日志中至少应包含一次 BLE start searching',
    ruleType: AssertionRuleType.event_must_exist,
    priority: 30,
    definition: {
      eventName: 'BLE start searching',
      minCount: 1,
    },
  },
  {
    name: '[default] ble_auth_failure_should_be_zero',
    description: '默认期望没有 BLE auth failure',
    ruleType: AssertionRuleType.event_must_not_exist,
    priority: 40,
    definition: {
      eventName: 'BLE auth failure',
      maxCount: 0,
    },
  },
  {
    name: '[default] ble_query_sn_failure_should_be_zero',
    description: '默认期望没有 BLE query sn failure',
    ruleType: AssertionRuleType.event_must_not_exist,
    priority: 50,
    definition: {
      eventName: 'BLE query sn failure',
      maxCount: 0,
    },
  },
  {
    name: '[default] scan_to_success_within_30s',
    description: '扫描开始后 30 秒内应出现扫描成功（按 attemptId 聚合）',
    ruleType: AssertionRuleType.event_must_exist_after_anchor,
    priority: 60,
    definition: {
      anchorEventName: 'BLE start searching',
      targetEventName: 'BLE search success',
      groupBy: 'attemptId',
      windowMs: 30_000,
      allowMissed: 2,
    },
  },
  {
    name: '[default] auth_sendkey_to_success_within_20s',
    description: '鉴权发送密钥后 20 秒内应鉴权成功（按 linkCode 聚合）',
    ruleType: AssertionRuleType.event_must_exist_after_anchor,
    priority: 70,
    definition: {
      anchorEventName: 'BLE auth sendKey',
      targetEventName: 'BLE auth success',
      groupBy: 'linkCode',
      windowMs: 20_000,
      allowMissed: 2,
    },
  },
  {
    name: '[default] network_request_failed_should_be_low',
    description: '网络请求失败事件数量应尽量少',
    ruleType: AssertionRuleType.event_must_not_exist,
    priority: 80,
    definition: {
      eventName: 'network_request_failed',
      maxCount: 5,
    },
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= 0 ? n : null;
}

function asDateString(value: unknown): string | undefined {
  const s = asString(value);
  if (!s) return undefined;
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function parseGroupBy(value: unknown): GroupByField | null {
  if (
    value === 'linkCode' ||
    value === 'attemptId' ||
    value === 'deviceMac' ||
    value === 'requestId'
  ) {
    return value;
  }
  return null;
}

@Injectable()
export class LogsAssertionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly helper: LogsHelperService,
  ) {}

  private normalizeDefinition(
    ruleType: AssertionRuleType,
    rawDefinition: unknown,
  ): NormalizedDefinition {
    const def = asRecord(rawDefinition);
    if (!def) {
      throw new ApiException({
        code: 'ASSERTION_RULE_INVALID_DEFINITION',
        message: 'Rule definition must be an object',
        status: 400,
      });
    }

    const startTime = asDateString(def.startTime);
    const endTime = asDateString(def.endTime);
    const levelGte = asInt(def.levelGte) ?? undefined;

    if (ruleType === AssertionRuleType.event_must_exist) {
      const eventName = asString(def.eventName);
      if (!eventName) {
        throw new ApiException({
          code: 'ASSERTION_RULE_INVALID_DEFINITION',
          message: 'eventName is required for event_must_exist',
          status: 400,
        });
      }
      return {
        eventName,
        minCount: asInt(def.minCount) ?? 1,
        startTime,
        endTime,
        levelGte,
      };
    }

    if (ruleType === AssertionRuleType.event_must_not_exist) {
      const eventName = asString(def.eventName);
      if (!eventName) {
        throw new ApiException({
          code: 'ASSERTION_RULE_INVALID_DEFINITION',
          message: 'eventName is required for event_must_not_exist',
          status: 400,
        });
      }
      return {
        eventName,
        maxCount: asInt(def.maxCount) ?? 0,
        startTime,
        endTime,
        levelGte,
      };
    }

    const anchorEventName = asString(def.anchorEventName);
    const targetEventName = asString(def.targetEventName);
    const groupBy = parseGroupBy(def.groupBy) ?? 'attemptId';
    const windowMs = asInt(def.windowMs) ?? 10_000;
    const allowMissed = asInt(def.allowMissed) ?? 0;

    if (!anchorEventName || !targetEventName) {
      throw new ApiException({
        code: 'ASSERTION_RULE_INVALID_DEFINITION',
        message:
          'anchorEventName and targetEventName are required for event_must_exist_after_anchor',
        status: 400,
      });
    }

    if (windowMs < 1_000 || windowMs > 10 * 60 * 1_000) {
      throw new ApiException({
        code: 'ASSERTION_RULE_INVALID_DEFINITION',
        message: 'windowMs must be between 1000 and 600000',
        status: 400,
      });
    }

    return {
      anchorEventName,
      targetEventName,
      groupBy,
      windowMs,
      allowMissed,
      startTime,
      endTime,
      levelGte,
    };
  }

  private buildEventWhere(params: {
    projectId: string;
    logFileId: string;
    eventName: string;
    startTime?: string;
    endTime?: string;
    levelGte?: number;
    groupBy?: GroupByField;
    keys?: string[];
  }): Prisma.LogEventWhereInput {
    const where: Prisma.LogEventWhereInput = {
      projectId: params.projectId,
      logFileId: params.logFileId,
      eventName: params.eventName,
    };

    if (params.levelGte !== undefined) {
      where.level = { gte: params.levelGte };
    }

    if (params.startTime || params.endTime) {
      where.timestampMs = {};
      if (params.startTime) {
        where.timestampMs.gte = BigInt(new Date(params.startTime).getTime());
      }
      if (params.endTime) {
        where.timestampMs.lte = BigInt(new Date(params.endTime).getTime());
      }
    }

    if (params.groupBy && params.keys && params.keys.length > 0) {
      where[params.groupBy] = { in: params.keys };
    }

    return where;
  }

  async createRule(params: {
    actorUserId: string;
    projectId: string;
    name: string;
    description?: string;
    ruleType: AssertionRuleType;
    definition: unknown;
    enabled?: boolean;
    priority?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release'],
    });

    const normalized = this.normalizeDefinition(
      params.ruleType,
      params.definition,
    );

    return this.prisma.logAssertionRule.create({
      data: {
        projectId: params.projectId,
        name: params.name.trim(),
        description: params.description?.trim() || null,
        ruleType: params.ruleType,
        definition: normalized as unknown as Prisma.InputJsonValue,
        enabled: params.enabled ?? true,
        priority: Math.min(Math.max(params.priority ?? 100, 1), 1000),
        createdBy: params.actorUserId,
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        description: true,
        ruleType: true,
        definition: true,
        enabled: true,
        priority: true,
        createdAt: true,
      },
    });
  }

  async listRules(params: {
    actorUserId: string;
    projectId: string;
    enabled?: boolean;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);

    const items = await this.prisma.logAssertionRule.findMany({
      where: {
        projectId: params.projectId,
        ...(params.enabled === undefined ? {} : { enabled: params.enabled }),
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        projectId: true,
        name: true,
        description: true,
        ruleType: true,
        definition: true,
        enabled: true,
        priority: true,
        createdAt: true,
      },
    });

    return { items };
  }

  private async evaluateMustExist(params: {
    projectId: string;
    logFileId: string;
    ruleId: string;
    ruleName: string;
    ruleType: AssertionRuleType;
    definition: EventMustExistDefinition;
  }): Promise<RuleEvaluationResult> {
    const where = this.buildEventWhere({
      projectId: params.projectId,
      logFileId: params.logFileId,
      eventName: params.definition.eventName,
      startTime: params.definition.startTime,
      endTime: params.definition.endTime,
      levelGte: params.definition.levelGte,
    });

    const [count, samples] = await Promise.all([
      this.prisma.logEvent.count({ where }),
      this.prisma.logEvent.findMany({
        where,
        orderBy: [{ timestampMs: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { id: true },
      }),
    ]);

    const passed = count >= params.definition.minCount;
    return {
      ruleId: params.ruleId,
      ruleName: params.ruleName,
      ruleType: params.ruleType,
      passed,
      message: passed
        ? `${params.definition.eventName} appears ${count} times`
        : `${params.definition.eventName} appears ${count} times, expected >= ${params.definition.minCount}`,
      actual: { count },
      expected: { minCount: params.definition.minCount },
      sampleEventIds: samples.map((s) => s.id),
    };
  }

  private async evaluateMustNotExist(params: {
    projectId: string;
    logFileId: string;
    ruleId: string;
    ruleName: string;
    ruleType: AssertionRuleType;
    definition: EventMustNotExistDefinition;
  }): Promise<RuleEvaluationResult> {
    const where = this.buildEventWhere({
      projectId: params.projectId,
      logFileId: params.logFileId,
      eventName: params.definition.eventName,
      startTime: params.definition.startTime,
      endTime: params.definition.endTime,
      levelGte: params.definition.levelGte,
    });

    const [count, samples] = await Promise.all([
      this.prisma.logEvent.count({ where }),
      this.prisma.logEvent.findMany({
        where,
        orderBy: [{ timestampMs: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { id: true },
      }),
    ]);

    const passed = count <= params.definition.maxCount;
    return {
      ruleId: params.ruleId,
      ruleName: params.ruleName,
      ruleType: params.ruleType,
      passed,
      message: passed
        ? `${params.definition.eventName} appears ${count} times`
        : `${params.definition.eventName} appears ${count} times, expected <= ${params.definition.maxCount}`,
      actual: { count },
      expected: { maxCount: params.definition.maxCount },
      sampleEventIds: samples.map((s) => s.id),
    };
  }

  private async evaluateAfterAnchor(params: {
    projectId: string;
    logFileId: string;
    ruleId: string;
    ruleName: string;
    ruleType: AssertionRuleType;
    definition: EventAfterAnchorDefinition;
  }): Promise<RuleEvaluationResult> {
    const anchorWhere = this.buildEventWhere({
      projectId: params.projectId,
      logFileId: params.logFileId,
      eventName: params.definition.anchorEventName,
      startTime: params.definition.startTime,
      endTime: params.definition.endTime,
      levelGte: params.definition.levelGte,
    });

    anchorWhere[params.definition.groupBy] = { not: null };

    const anchors = await this.prisma.logEvent.findMany({
      where: anchorWhere,
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      take: 5000,
      select: {
        id: true,
        timestampMs: true,
        linkCode: true,
        attemptId: true,
        deviceMac: true,
        requestId: true,
      },
    });

    if (anchors.length === 0) {
      return {
        ruleId: params.ruleId,
        ruleName: params.ruleName,
        ruleType: params.ruleType,
        passed: true,
        message: 'No anchor events found; skipped',
        actual: { anchors: 0, matched: 0, missed: 0 },
        expected: { allowMissed: params.definition.allowMissed },
        sampleEventIds: [],
      };
    }

    const keyOf = (row: {
      linkCode: string | null;
      attemptId: string | null;
      deviceMac: string | null;
      requestId: string | null;
    }) => {
      const value = row[params.definition.groupBy];
      return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : null;
    };

    const keys = Array.from(
      new Set(anchors.map((a) => keyOf(a)).filter((k): k is string => !!k)),
    );

    const firstTs = Number(anchors[0].timestampMs);
    const lastTs = Number(anchors[anchors.length - 1].timestampMs);
    const targetWhere = this.buildEventWhere({
      projectId: params.projectId,
      logFileId: params.logFileId,
      eventName: params.definition.targetEventName,
      startTime: new Date(firstTs).toISOString(),
      endTime: new Date(lastTs + params.definition.windowMs).toISOString(),
      groupBy: params.definition.groupBy,
      keys,
    });

    const targets = await this.prisma.logEvent.findMany({
      where: targetWhere,
      orderBy: [{ timestampMs: 'asc' }, { id: 'asc' }],
      take: 20000,
      select: {
        id: true,
        timestampMs: true,
        linkCode: true,
        attemptId: true,
        deviceMac: true,
        requestId: true,
      },
    });

    const targetMap = new Map<string, Array<{ id: string; ts: number }>>();
    for (const t of targets) {
      const key = keyOf(t);
      if (!key) continue;
      const list = targetMap.get(key) ?? [];
      list.push({ id: t.id, ts: Number(t.timestampMs) });
      targetMap.set(key, list);
    }

    const missedAnchorIds: string[] = [];
    const sampleTargetIds: string[] = [];

    for (const anchor of anchors) {
      const key = keyOf(anchor);
      if (!key) {
        missedAnchorIds.push(anchor.id);
        continue;
      }

      const startTs = Number(anchor.timestampMs);
      const endTs = startTs + params.definition.windowMs;
      const list = targetMap.get(key) ?? [];

      const matched = list.find(
        (item) => item.ts >= startTs && item.ts <= endTs,
      );
      if (!matched) {
        missedAnchorIds.push(anchor.id);
      } else {
        sampleTargetIds.push(matched.id);
      }
    }

    const missed = missedAnchorIds.length;
    const matched = anchors.length - missed;
    const passed = missed <= params.definition.allowMissed;

    return {
      ruleId: params.ruleId,
      ruleName: params.ruleName,
      ruleType: params.ruleType,
      passed,
      message: passed
        ? `${matched}/${anchors.length} anchor events matched target within ${params.definition.windowMs}ms`
        : `${missed} anchor events missing ${params.definition.targetEventName} within ${params.definition.windowMs}ms`,
      actual: {
        anchors: anchors.length,
        matched,
        missed,
      },
      expected: {
        allowMissed: params.definition.allowMissed,
        windowMs: params.definition.windowMs,
      },
      sampleEventIds: [
        ...missedAnchorIds.slice(0, 5),
        ...sampleTargetIds.slice(0, 5),
      ],
    };
  }

  private async runValidationCore(params: {
    projectId: string;
    logFileId: string;
    ruleIds?: string[];
    triggeredBy?: string;
    createdBy?: string | null;
  }) {
    const loadRules = () =>
      this.prisma.logAssertionRule.findMany({
        where: {
          projectId: params.projectId,
          enabled: true,
          ...(params.ruleIds && params.ruleIds.length > 0
            ? { id: { in: params.ruleIds } }
            : {}),
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          ruleType: true,
          definition: true,
        },
      });

    let rules = await loadRules();
    if (
      rules.length === 0 &&
      (params.triggeredBy?.trim() || 'manual') === 'auto'
    ) {
      await this.installDefaultRulesInternal({
        projectId: params.projectId,
        createdBy: params.createdBy ?? null,
      });
      rules = await loadRules();
    }

    const run = await this.prisma.logAssertionRun.create({
      data: {
        projectId: params.projectId,
        logFileId: params.logFileId,
        status: AssertionRunStatus.running,
        triggeredBy: params.triggeredBy?.trim() || 'manual',
        startedAt: new Date(),
        createdBy: params.createdBy ?? null,
      },
      select: { id: true },
    });

    try {
      const details: RuleEvaluationResult[] = [];

      for (const rule of rules) {
        const normalized = this.normalizeDefinition(
          rule.ruleType,
          rule.definition,
        );

        let result: RuleEvaluationResult;
        if (rule.ruleType === AssertionRuleType.event_must_exist) {
          result = await this.evaluateMustExist({
            projectId: params.projectId,
            logFileId: params.logFileId,
            ruleId: rule.id,
            ruleName: rule.name,
            ruleType: rule.ruleType,
            definition: normalized as EventMustExistDefinition,
          });
        } else if (rule.ruleType === AssertionRuleType.event_must_not_exist) {
          result = await this.evaluateMustNotExist({
            projectId: params.projectId,
            logFileId: params.logFileId,
            ruleId: rule.id,
            ruleName: rule.name,
            ruleType: rule.ruleType,
            definition: normalized as EventMustNotExistDefinition,
          });
        } else {
          result = await this.evaluateAfterAnchor({
            projectId: params.projectId,
            logFileId: params.logFileId,
            ruleId: rule.id,
            ruleName: rule.name,
            ruleType: rule.ruleType,
            definition: normalized as EventAfterAnchorDefinition,
          });
        }

        details.push(result);
      }

      const totalRules = details.length;
      const failedRules = details.filter((d) => !d.passed);
      const passedRules = totalRules - failedRules.length;
      const passRate =
        totalRules > 0
          ? Math.round((passedRules / totalRules) * 10000) / 100
          : 100;

      const summary = {
        runId: run.id,
        pass: failedRules.length === 0,
        totalRules,
        passedRules,
        failedRules: failedRules.length,
        passRate,
      };

      await this.prisma.logAssertionRun.update({
        where: { id: run.id },
        data: {
          status: AssertionRunStatus.completed,
          totalRules,
          passedRules,
          failedRules: failedRules.length,
          passRate,
          summary: summary as unknown as Prisma.InputJsonValue,
          details: details as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      return {
        ...summary,
        details,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.logAssertionRun.update({
        where: { id: run.id },
        data: {
          status: AssertionRunStatus.failed,
          errorMessage: message,
          completedAt: new Date(),
        },
      });
      throw e;
    }
  }

  private async installDefaultRulesInternal(params: {
    projectId: string;
    createdBy?: string | null;
  }) {
    const existing = await this.prisma.logAssertionRule.findMany({
      where: {
        projectId: params.projectId,
        name: { in: DEFAULT_ASSERTION_TEMPLATES.map((t) => t.name) },
      },
      select: {
        name: true,
      },
    });
    const existingNames = new Set(existing.map((item) => item.name));

    const createdNames: string[] = [];
    const skippedNames: string[] = [];

    for (const template of DEFAULT_ASSERTION_TEMPLATES) {
      if (existingNames.has(template.name)) {
        skippedNames.push(template.name);
        continue;
      }

      const normalized = this.normalizeDefinition(
        template.ruleType,
        template.definition,
      );

      await this.prisma.logAssertionRule.create({
        data: {
          projectId: params.projectId,
          name: template.name,
          description: template.description,
          ruleType: template.ruleType,
          definition: normalized as unknown as Prisma.InputJsonValue,
          enabled: true,
          priority: template.priority,
          createdBy: params.createdBy ?? null,
        },
      });
      createdNames.push(template.name);
    }

    return {
      totalTemplates: DEFAULT_ASSERTION_TEMPLATES.length,
      createdCount: createdNames.length,
      skippedCount: skippedNames.length,
      createdNames,
      skippedNames,
    };
  }

  async installDefaultRules(params: {
    actorUserId: string;
    projectId: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release'],
    });

    return this.installDefaultRulesInternal({
      projectId: params.projectId,
      createdBy: params.actorUserId,
    });
  }

  async runValidation(params: {
    actorUserId: string;
    projectId: string;
    logFileId: string;
    ruleIds?: string[];
    triggeredBy?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support'],
    });

    await this.helper.assertLogFileInProject({
      projectId: params.projectId,
      logFileId: params.logFileId,
    });

    return this.runValidationCore({
      projectId: params.projectId,
      logFileId: params.logFileId,
      ruleIds: params.ruleIds,
      triggeredBy: params.triggeredBy,
      createdBy: params.actorUserId,
    });
  }

  async runValidationInternal(params: {
    projectId: string;
    logFileId: string;
    ruleIds?: string[];
    triggeredBy?: string;
  }) {
    await this.helper.assertLogFileInProject({
      projectId: params.projectId,
      logFileId: params.logFileId,
    });

    return this.runValidationCore({
      projectId: params.projectId,
      logFileId: params.logFileId,
      ruleIds: params.ruleIds,
      triggeredBy: params.triggeredBy ?? 'auto',
      createdBy: null,
    });
  }

  async listRuns(params: {
    actorUserId: string;
    projectId: string;
    logFileId?: string;
    status?: AssertionRunStatus;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    if (params.logFileId) {
      await this.helper.assertLogFileInProject({
        projectId: params.projectId,
        logFileId: params.logFileId,
      });
    }

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const items = await this.prisma.logAssertionRun.findMany({
      where: {
        projectId: params.projectId,
        ...(params.logFileId ? { logFileId: params.logFileId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        projectId: true,
        logFileId: true,
        status: true,
        triggeredBy: true,
        totalRules: true,
        passedRules: true,
        failedRules: true,
        passRate: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        logFile: {
          select: {
            fileName: true,
            uploadedAt: true,
          },
        },
      },
    });

    return { items };
  }

  async getRun(params: {
    actorUserId: string;
    projectId: string;
    runId: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const run = await this.prisma.logAssertionRun.findFirst({
      where: {
        id: params.runId,
        projectId: params.projectId,
      },
      select: {
        id: true,
        projectId: true,
        logFileId: true,
        status: true,
        triggeredBy: true,
        totalRules: true,
        passedRules: true,
        failedRules: true,
        passRate: true,
        summary: true,
        details: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        logFile: {
          select: {
            fileName: true,
            uploadedAt: true,
          },
        },
      },
    });

    if (!run) {
      throw new ApiException({
        code: 'ASSERTION_RUN_NOT_FOUND',
        message: 'Assertion run not found',
        status: 404,
      });
    }

    return run;
  }
}
