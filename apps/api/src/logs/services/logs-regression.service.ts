import { Injectable } from '@nestjs/common';
import { AnalysisStatus, Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { LogsHelperService } from './logs-helper.service';

type RegressionSnapshot = {
  qualityScore: number;
  totalEvents: number;
  errorEvents: number;
  warningEvents: number;
  sessionCount: number;
  deviceCount: number;
  errorRate: number;
};

type RegressionThresholds = {
  qualityScoreDropMax: number;
  errorRateIncreaseMax: number;
  errorEventsIncreaseMax: number;
  warningEventsIncreaseMax: number;
  sessionCountDropMax: number;
  deviceCountDropMax: number;
};

type RegressionMetric =
  | 'qualityScore'
  | 'errorRate'
  | 'errorEvents'
  | 'warningEvents'
  | 'sessionCount'
  | 'deviceCount';

type RegressionViolation = {
  metric: RegressionMetric;
  kind: 'drop' | 'increase';
  baselineValue: number;
  targetValue: number;
  delta: number;
  threshold: number;
  message: string;
};

type RegressionEvaluation = {
  pass: boolean;
  diff: {
    qualityScore: number;
    errorRate: number;
    errorEvents: number;
    warningEvents: number;
    sessionCount: number;
    deviceCount: number;
  };
  violations: RegressionViolation[];
};

type ResolvedBaseline = {
  id: string;
  logFileId: string;
  name: string;
  snapshot: RegressionSnapshot;
  thresholdPatch: Partial<RegressionThresholds>;
};

const DEFAULT_THRESHOLDS: RegressionThresholds = {
  qualityScoreDropMax: 5,
  errorRateIncreaseMax: 1,
  errorEventsIncreaseMax: 20,
  warningEventsIncreaseMax: 40,
  sessionCountDropMax: 0,
  deviceCountDropMax: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function toSnapshot(params: {
  qualityScore: number;
  totalEvents: number;
  errorEvents: number;
  warningEvents: number;
  sessionCount: number;
  deviceCount: number;
}): RegressionSnapshot {
  const errorRate =
    params.totalEvents > 0
      ? (params.errorEvents / params.totalEvents) * 100
      : 0;
  return {
    ...params,
    errorRate: Math.round(errorRate * 100) / 100,
  };
}

@Injectable()
export class LogsRegressionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly helper: LogsHelperService,
  ) {}

  private parseThresholds(value: unknown): Partial<RegressionThresholds> {
    const obj = asRecord(value);
    if (!obj) return {};

    const out: Partial<RegressionThresholds> = {};
    const assign = <K extends keyof RegressionThresholds>(key: K) => {
      const n = asFiniteNumber(obj[key]);
      if (n === null || n < 0) return;
      out[key] = n;
    };

    assign('qualityScoreDropMax');
    assign('errorRateIncreaseMax');
    assign('errorEventsIncreaseMax');
    assign('warningEventsIncreaseMax');
    assign('sessionCountDropMax');
    assign('deviceCountDropMax');

    return out;
  }

  private parseSnapshot(value: Prisma.JsonValue): RegressionSnapshot {
    const obj = asRecord(value);
    if (!obj) {
      throw new ApiException({
        code: 'REGRESSION_BASELINE_INVALID',
        message: 'Regression baseline snapshot is invalid',
        status: 500,
      });
    }

    const read = (key: keyof RegressionSnapshot) => {
      const n = asFiniteNumber(obj[key]);
      if (n === null) {
        throw new ApiException({
          code: 'REGRESSION_BASELINE_INVALID',
          message: `Regression baseline snapshot missing ${key}`,
          status: 500,
        });
      }
      return n;
    };

    return {
      qualityScore: read('qualityScore'),
      totalEvents: read('totalEvents'),
      errorEvents: read('errorEvents'),
      warningEvents: read('warningEvents'),
      sessionCount: read('sessionCount'),
      deviceCount: read('deviceCount'),
      errorRate: read('errorRate'),
    };
  }

  private async getCompletedAnalysis(params: {
    logFileId: string;
    projectId: string;
  }): Promise<RegressionSnapshot> {
    const analysis = await this.prisma.logFileAnalysis.findUnique({
      where: { logFileId: params.logFileId },
      select: {
        qualityScore: true,
        totalEvents: true,
        errorEvents: true,
        warningEvents: true,
        sessionCount: true,
        deviceCount: true,
        status: true,
      },
    });

    if (!analysis || analysis.status !== AnalysisStatus.completed) {
      throw new ApiException({
        code: 'ANALYSIS_NOT_READY',
        message: 'Analysis is not completed for this log file',
        status: 400,
      });
    }

    return toSnapshot({
      qualityScore: analysis.qualityScore,
      totalEvents: analysis.totalEvents,
      errorEvents: analysis.errorEvents,
      warningEvents: analysis.warningEvents,
      sessionCount: analysis.sessionCount,
      deviceCount: analysis.deviceCount,
    });
  }

  async createBaseline(params: {
    actorUserId: string;
    projectId: string;
    logFileId: string;
    name: string;
    description?: string;
    thresholds?: unknown;
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

    const snapshot = await this.getCompletedAnalysis({
      logFileId: params.logFileId,
      projectId: params.projectId,
    });

    const thresholdPatch = this.parseThresholds(params.thresholds);

    const baseline = await this.prisma.logRegressionBaseline.create({
      data: {
        projectId: params.projectId,
        logFileId: params.logFileId,
        name: params.name.trim(),
        description: params.description?.trim() || null,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        thresholds:
          Object.keys(thresholdPatch).length > 0
            ? (thresholdPatch as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        createdBy: params.actorUserId,
      },
      select: {
        id: true,
        projectId: true,
        logFileId: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        snapshot: true,
        thresholds: true,
      },
    });

    return {
      ...baseline,
      snapshot,
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        ...thresholdPatch,
      },
    };
  }

  async listBaselines(params: {
    actorUserId: string;
    projectId: string;
    isActive?: boolean;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const rows = await this.prisma.logRegressionBaseline.findMany({
      where: {
        projectId: params.projectId,
        ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        projectId: true,
        logFileId: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        snapshot: true,
        thresholds: true,
        logFile: {
          select: {
            fileName: true,
            uploadedAt: true,
          },
        },
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        logFileId: row.logFileId,
        name: row.name,
        description: row.description,
        isActive: row.isActive,
        createdAt: row.createdAt,
        logFileName: row.logFile.fileName,
        logUploadedAt: row.logFile.uploadedAt,
        snapshot: this.parseSnapshot(row.snapshot),
        thresholds: {
          ...DEFAULT_THRESHOLDS,
          ...this.parseThresholds(row.thresholds),
        },
      })),
    };
  }

  private async resolveBaseline(params: {
    projectId: string;
    baselineId?: string;
    baselineLogFileId?: string;
  }): Promise<ResolvedBaseline> {
    const baseline = params.baselineId
      ? await this.prisma.logRegressionBaseline.findFirst({
          where: {
            id: params.baselineId,
            projectId: params.projectId,
          },
          select: {
            id: true,
            logFileId: true,
            name: true,
            snapshot: true,
            thresholds: true,
          },
        })
      : await this.prisma.logRegressionBaseline.findFirst({
          where: {
            projectId: params.projectId,
            logFileId: params.baselineLogFileId,
            isActive: true,
          },
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            logFileId: true,
            name: true,
            snapshot: true,
            thresholds: true,
          },
        });

    if (!baseline) {
      throw new ApiException({
        code: 'REGRESSION_BASELINE_NOT_FOUND',
        message: 'Regression baseline not found',
        status: 404,
      });
    }

    return {
      id: baseline.id,
      logFileId: baseline.logFileId,
      name: baseline.name,
      snapshot: this.parseSnapshot(baseline.snapshot),
      thresholdPatch: this.parseThresholds(baseline.thresholds),
    };
  }

  private evaluateAgainstBaseline(params: {
    baseline: RegressionSnapshot;
    target: RegressionSnapshot;
    thresholds: RegressionThresholds;
  }): RegressionEvaluation {
    const violations: RegressionViolation[] = [];

    const pushDropViolation = (args: {
      metric: RegressionMetric;
      baselineValue: number;
      targetValue: number;
      threshold: number;
      label: string;
    }) => {
      const drop = args.baselineValue - args.targetValue;
      if (drop <= args.threshold) return;
      violations.push({
        metric: args.metric,
        kind: 'drop',
        baselineValue: args.baselineValue,
        targetValue: args.targetValue,
        delta: Math.round(drop * 100) / 100,
        threshold: args.threshold,
        message: `${args.label} dropped by ${drop.toFixed(2)} (max allowed ${args.threshold.toFixed(2)})`,
      });
    };

    const pushIncreaseViolation = (args: {
      metric: RegressionMetric;
      baselineValue: number;
      targetValue: number;
      threshold: number;
      label: string;
    }) => {
      const increase = args.targetValue - args.baselineValue;
      if (increase <= args.threshold) return;
      violations.push({
        metric: args.metric,
        kind: 'increase',
        baselineValue: args.baselineValue,
        targetValue: args.targetValue,
        delta: Math.round(increase * 100) / 100,
        threshold: args.threshold,
        message: `${args.label} increased by ${increase.toFixed(2)} (max allowed ${args.threshold.toFixed(2)})`,
      });
    };

    pushDropViolation({
      metric: 'qualityScore',
      baselineValue: params.baseline.qualityScore,
      targetValue: params.target.qualityScore,
      threshold: params.thresholds.qualityScoreDropMax,
      label: 'qualityScore',
    });

    pushIncreaseViolation({
      metric: 'errorRate',
      baselineValue: params.baseline.errorRate,
      targetValue: params.target.errorRate,
      threshold: params.thresholds.errorRateIncreaseMax,
      label: 'errorRate',
    });

    pushIncreaseViolation({
      metric: 'errorEvents',
      baselineValue: params.baseline.errorEvents,
      targetValue: params.target.errorEvents,
      threshold: params.thresholds.errorEventsIncreaseMax,
      label: 'errorEvents',
    });

    pushIncreaseViolation({
      metric: 'warningEvents',
      baselineValue: params.baseline.warningEvents,
      targetValue: params.target.warningEvents,
      threshold: params.thresholds.warningEventsIncreaseMax,
      label: 'warningEvents',
    });

    pushDropViolation({
      metric: 'sessionCount',
      baselineValue: params.baseline.sessionCount,
      targetValue: params.target.sessionCount,
      threshold: params.thresholds.sessionCountDropMax,
      label: 'sessionCount',
    });

    pushDropViolation({
      metric: 'deviceCount',
      baselineValue: params.baseline.deviceCount,
      targetValue: params.target.deviceCount,
      threshold: params.thresholds.deviceCountDropMax,
      label: 'deviceCount',
    });

    return {
      pass: violations.length === 0,
      diff: {
        qualityScore: params.target.qualityScore - params.baseline.qualityScore,
        errorRate: params.target.errorRate - params.baseline.errorRate,
        errorEvents: params.target.errorEvents - params.baseline.errorEvents,
        warningEvents:
          params.target.warningEvents - params.baseline.warningEvents,
        sessionCount: params.target.sessionCount - params.baseline.sessionCount,
        deviceCount: params.target.deviceCount - params.baseline.deviceCount,
      },
      violations,
    };
  }

  async compareWithBaseline(params: {
    actorUserId: string;
    projectId: string;
    targetLogFileId: string;
    baselineId?: string;
    baselineLogFileId?: string;
    thresholds?: unknown;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    await this.helper.assertLogFileInProject({
      projectId: params.projectId,
      logFileId: params.targetLogFileId,
    });

    const target = await this.getCompletedAnalysis({
      logFileId: params.targetLogFileId,
      projectId: params.projectId,
    });

    const baseline = await this.resolveBaseline({
      projectId: params.projectId,
      baselineId: params.baselineId,
      baselineLogFileId: params.baselineLogFileId,
    });

    const effectiveThresholds: RegressionThresholds = {
      ...DEFAULT_THRESHOLDS,
      ...baseline.thresholdPatch,
      ...this.parseThresholds(params.thresholds),
    };

    const evaluation = this.evaluateAgainstBaseline({
      baseline: baseline.snapshot,
      target,
      thresholds: effectiveThresholds,
    });

    return {
      pass: evaluation.pass,
      baseline: {
        id: baseline.id,
        logFileId: baseline.logFileId,
        name: baseline.name,
        snapshot: baseline.snapshot,
      },
      target: {
        logFileId: params.targetLogFileId,
        snapshot: target,
      },
      thresholds: effectiveThresholds,
      diff: evaluation.diff,
      violations: evaluation.violations,
    };
  }

  async getRegressionTrend(params: {
    actorUserId: string;
    projectId: string;
    baselineId?: string;
    baselineLogFileId?: string;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const baseline = await this.resolveBaseline({
      projectId: params.projectId,
      baselineId: params.baselineId,
      baselineLogFileId: params.baselineLogFileId,
    });
    const effectiveThresholds: RegressionThresholds = {
      ...DEFAULT_THRESHOLDS,
      ...baseline.thresholdPatch,
    };

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const rows = await this.prisma.logFileAnalysis.findMany({
      where: {
        projectId: params.projectId,
        status: AnalysisStatus.completed,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        logFileId: true,
        qualityScore: true,
        totalEvents: true,
        errorEvents: true,
        warningEvents: true,
        sessionCount: true,
        deviceCount: true,
        analyzedAt: true,
        createdAt: true,
        logFile: {
          select: {
            fileName: true,
            uploadedAt: true,
          },
        },
      },
    });

    return {
      baseline: {
        id: baseline.id,
        logFileId: baseline.logFileId,
        name: baseline.name,
        snapshot: baseline.snapshot,
      },
      thresholds: effectiveThresholds,
      items: rows.map((row) => {
        const target = toSnapshot({
          qualityScore: row.qualityScore,
          totalEvents: row.totalEvents,
          errorEvents: row.errorEvents,
          warningEvents: row.warningEvents,
          sessionCount: row.sessionCount,
          deviceCount: row.deviceCount,
        });
        const evaluation = this.evaluateAgainstBaseline({
          baseline: baseline.snapshot,
          target,
          thresholds: effectiveThresholds,
        });
        return {
          logFileId: row.logFileId,
          fileName: row.logFile.fileName,
          uploadedAt: row.logFile.uploadedAt,
          analyzedAt: row.analyzedAt,
          analysisCreatedAt: row.createdAt,
          pass: evaluation.pass,
          violationCount: evaluation.violations.length,
          diff: evaluation.diff,
          target,
          topViolations: evaluation.violations.slice(0, 3),
        };
      }),
    };
  }
}
