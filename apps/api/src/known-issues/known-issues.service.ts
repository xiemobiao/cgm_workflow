import { Injectable } from '@nestjs/common';
import { IssueCategory, Prisma, ReportType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class KnownIssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // Create a known issue
  async create(params: {
    actorUserId: string;
    projectId: string;
    title: string;
    description: string;
    solution: string;
    category?: IssueCategory;
    severity?: number;
    errorCode?: string;
    eventPattern?: string;
    msgPattern?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA'],
    });

    return this.prisma.knownIssue.create({
      data: {
        projectId: params.projectId,
        title: params.title,
        description: params.description,
        solution: params.solution,
        category: params.category ?? IssueCategory.other,
        severity: params.severity ?? 2,
        errorCode: params.errorCode,
        eventPattern: params.eventPattern,
        msgPattern: params.msgPattern,
        createdBy: params.actorUserId,
      },
    });
  }

  // List known issues
  async list(params: {
    actorUserId: string;
    projectId: string;
    category?: IssueCategory;
    isActive?: boolean;
    limit?: number;
    cursor?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const where: Prisma.KnownIssueWhereInput = {
      projectId: params.projectId,
    };

    if (params.category) {
      where.category = params.category;
    }
    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    const items = await this.prisma.knownIssue.findMany({
      where,
      orderBy: [
        { hitCount: 'desc' },
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit + 1,
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;

    return {
      items: result,
      hasMore,
    };
  }

  // Get single known issue
  async getById(params: {
    actorUserId: string;
    projectId: string;
    id: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    return this.prisma.knownIssue.findFirst({
      where: {
        id: params.id,
        projectId: params.projectId,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  // Update known issue
  async update(params: {
    actorUserId: string;
    projectId: string;
    id: string;
    title?: string;
    description?: string;
    solution?: string;
    category?: IssueCategory;
    severity?: number;
    errorCode?: string;
    eventPattern?: string;
    msgPattern?: string;
    isActive?: boolean;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA'],
    });

    const data: Prisma.KnownIssueUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.description !== undefined) data.description = params.description;
    if (params.solution !== undefined) data.solution = params.solution;
    if (params.category !== undefined) data.category = params.category;
    if (params.severity !== undefined) data.severity = params.severity;
    if (params.errorCode !== undefined) data.errorCode = params.errorCode;
    if (params.eventPattern !== undefined)
      data.eventPattern = params.eventPattern;
    if (params.msgPattern !== undefined) data.msgPattern = params.msgPattern;
    if (params.isActive !== undefined) data.isActive = params.isActive;

    return this.prisma.knownIssue.update({
      where: { id: params.id },
      data,
    });
  }

  // Delete known issue
  async delete(params: { actorUserId: string; projectId: string; id: string }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM'],
    });

    await this.prisma.knownIssue.delete({
      where: { id: params.id },
    });

    return { success: true };
  }

  // Match a log event against known issues
  async matchEvent(params: {
    actorUserId: string;
    projectId: string;
    eventName: string;
    errorCode?: string;
    msg?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const issues = await this.prisma.knownIssue.findMany({
      where: {
        projectId: params.projectId,
        isActive: true,
      },
      orderBy: { severity: 'desc' },
    });

    const matches: Array<{
      issue: (typeof issues)[0];
      matchType: 'errorCode' | 'eventPattern' | 'msgPattern';
      confidence: number;
    }> = [];

    for (const issue of issues) {
      // Match by error code (exact match)
      if (
        issue.errorCode &&
        params.errorCode &&
        issue.errorCode === params.errorCode
      ) {
        matches.push({
          issue,
          matchType: 'errorCode',
          confidence: 1.0,
        });
        continue;
      }

      // Match by event pattern (regex)
      if (issue.eventPattern) {
        try {
          const regex = new RegExp(issue.eventPattern, 'i');
          if (regex.test(params.eventName)) {
            matches.push({
              issue,
              matchType: 'eventPattern',
              confidence: 0.9,
            });
            continue;
          }
        } catch {
          // Invalid regex, skip
        }
      }

      // Match by message pattern (regex)
      if (issue.msgPattern && params.msg) {
        try {
          const regex = new RegExp(issue.msgPattern, 'i');
          if (regex.test(params.msg)) {
            matches.push({
              issue,
              matchType: 'msgPattern',
              confidence: 0.8,
            });
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    // Update hit count for matched issues
    if (matches.length > 0) {
      await this.prisma.knownIssue.updateMany({
        where: {
          id: { in: matches.map((m) => m.issue.id) },
        },
        data: {
          hitCount: { increment: 1 },
        },
      });
    }

    return {
      matches: matches.map((m) => ({
        id: m.issue.id,
        title: m.issue.title,
        description: m.issue.description,
        solution: m.issue.solution,
        category: m.issue.category,
        severity: m.issue.severity,
        matchType: m.matchType,
        confidence: m.confidence,
      })),
    };
  }

  // Batch match multiple events
  async matchBatch(params: {
    actorUserId: string;
    projectId: string;
    events: Array<{
      id: string;
      eventName: string;
      errorCode?: string;
      msg?: string;
    }>;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const issues = await this.prisma.knownIssue.findMany({
      where: {
        projectId: params.projectId,
        isActive: true,
      },
      orderBy: { severity: 'desc' },
    });

    const results: Array<{
      eventId: string;
      matches: Array<{
        issueId: string;
        title: string;
        solution: string;
        matchType: string;
        confidence: number;
        eventPattern: string | null;
        errorCode: string | null;
      }>;
    }> = [];

    const hitIssueIds = new Set<string>();

    for (const event of params.events) {
      const eventMatches: Array<{
        issueId: string;
        title: string;
        solution: string;
        matchType: string;
        confidence: number;
        eventPattern: string | null;
        errorCode: string | null;
      }> = [];

      for (const issue of issues) {
        // Match by error code
        if (
          issue.errorCode &&
          event.errorCode &&
          issue.errorCode === event.errorCode
        ) {
          eventMatches.push({
            issueId: issue.id,
            title: issue.title,
            solution: issue.solution,
            matchType: 'errorCode',
            confidence: 1.0,
            eventPattern: issue.eventPattern,
            errorCode: issue.errorCode,
          });
          hitIssueIds.add(issue.id);
          continue;
        }

        // Match by event pattern
        if (issue.eventPattern) {
          try {
            const regex = new RegExp(issue.eventPattern, 'i');
            if (regex.test(event.eventName)) {
              eventMatches.push({
                issueId: issue.id,
                title: issue.title,
                solution: issue.solution,
                matchType: 'eventPattern',
                confidence: 0.9,
                eventPattern: issue.eventPattern,
                errorCode: issue.errorCode,
              });
              hitIssueIds.add(issue.id);
              continue;
            }
          } catch {
            // Invalid regex
          }
        }

        // Match by message pattern
        if (issue.msgPattern && event.msg) {
          try {
            const regex = new RegExp(issue.msgPattern, 'i');
            if (regex.test(event.msg)) {
              eventMatches.push({
                issueId: issue.id,
                title: issue.title,
                solution: issue.solution,
                matchType: 'msgPattern',
                confidence: 0.8,
                eventPattern: issue.eventPattern,
                errorCode: issue.errorCode,
              });
              hitIssueIds.add(issue.id);
            }
          } catch {
            // Invalid regex
          }
        }
      }

      if (eventMatches.length > 0) {
        results.push({
          eventId: event.id,
          matches: eventMatches,
        });
      }
    }

    // Update hit counts
    if (hitIssueIds.size > 0) {
      await this.prisma.knownIssue.updateMany({
        where: {
          id: { in: Array.from(hitIssueIds) },
        },
        data: {
          hitCount: { increment: 1 },
        },
      });
    }

    return {
      results,
      totalMatches: results.length,
      eventsWithMatches: results.filter((r) => r.matches.length > 0).length,
    };
  }

  // Generate analysis report
  async generateReport(params: {
    actorUserId: string;
    projectId: string;
    reportType: ReportType;
    title?: string;
    linkCode?: string;
    deviceMac?: string;
    startTime?: string;
    endTime?: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support'],
    });

    let content: Prisma.InputJsonValue = {};
    let summary = '';
    const sourceData: Prisma.InputJsonValue = {
      linkCode: params.linkCode ?? null,
      deviceMac: params.deviceMac ?? null,
      startTime: params.startTime ?? null,
      endTime: params.endTime ?? null,
    };

    switch (params.reportType) {
      case ReportType.session_analysis: {
        if (!params.linkCode) {
          throw new Error('linkCode is required for session_analysis report');
        }
        const sessionReport = await this.generateSessionReport(
          params.projectId,
          params.linkCode,
        );
        content = sessionReport.content;
        summary = sessionReport.summary;
        break;
      }

      case ReportType.error_distribution: {
        if (!params.startTime || !params.endTime) {
          throw new Error(
            'startTime and endTime are required for error_distribution report',
          );
        }
        const errorReport = await this.generateErrorReport(
          params.projectId,
          params.startTime,
          params.endTime,
          params.deviceMac,
        );
        content = errorReport.content;
        summary = errorReport.summary;
        break;
      }

      default:
        throw new Error(
          `Report type ${params.reportType} is not yet implemented`,
        );
    }

    const title =
      params.title ?? `${params.reportType} - ${new Date().toISOString()}`;

    const report = await this.prisma.analysisReport.create({
      data: {
        projectId: params.projectId,
        title,
        reportType: params.reportType,
        content,
        sourceData,
        summary,
        createdBy: params.actorUserId,
      },
    });

    return report;
  }

  private async generateSessionReport(projectId: string, linkCode: string) {
    const session = await this.prisma.deviceSession.findUnique({
      where: {
        projectId_linkCode: { projectId, linkCode },
      },
    });

    const events = await this.prisma.logEvent.findMany({
      where: {
        projectId,
        linkCode,
      },
      orderBy: { timestampMs: 'asc' },
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        errorCode: true,
        requestId: true,
      },
    });

    const errorEvents = events.filter((e) => e.level >= 4);
    const requestIds = new Set(
      events.filter((e) => e.requestId).map((e) => e.requestId),
    );

    const content = {
      session: session
        ? {
            id: session.id,
            projectId: session.projectId,
            linkCode: session.linkCode,
            deviceMac: session.deviceMac,
            startTimeMs: Number(session.startTimeMs),
            endTimeMs: session.endTimeMs ? Number(session.endTimeMs) : null,
            durationMs: session.durationMs,
            status: session.status,
            eventCount: session.eventCount,
            errorCount: session.errorCount,
            commandCount: session.commandCount,
            scanStartMs: session.scanStartMs
              ? Number(session.scanStartMs)
              : null,
            pairStartMs: session.pairStartMs
              ? Number(session.pairStartMs)
              : null,
            connectStartMs: session.connectStartMs
              ? Number(session.connectStartMs)
              : null,
            connectedMs: session.connectedMs
              ? Number(session.connectedMs)
              : null,
            disconnectMs: session.disconnectMs
              ? Number(session.disconnectMs)
              : null,
            sdkVersion: session.sdkVersion,
            appId: session.appId,
            terminalInfo: session.terminalInfo,
            createdAt: session.createdAt.toISOString(),
          }
        : null,
      eventCount: events.length,
      errorCount: errorEvents.length,
      commandCount: requestIds.size,
      timeline: events.slice(0, 100).map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        errorCode: e.errorCode,
      })),
      errors: errorEvents.slice(0, 20).map((e) => ({
        id: e.id,
        eventName: e.eventName,
        timestampMs: Number(e.timestampMs),
        errorCode: e.errorCode,
      })),
    };

    const durationText = session?.durationMs
      ? `${(session.durationMs / 1000).toFixed(1)}s`
      : 'unknown';

    const summary = `Session ${linkCode}: ${events.length} events, ${errorEvents.length} errors, ${requestIds.size} commands. Duration: ${durationText}. Status: ${session?.status ?? 'unknown'}.`;

    return { content, summary };
  }

  private async generateErrorReport(
    projectId: string,
    startTime: string,
    endTime: string,
    deviceMac?: string,
  ) {
    const startMs = BigInt(new Date(startTime).getTime());
    const endMs = BigInt(new Date(endTime).getTime());

    const where: Prisma.LogEventWhereInput = {
      projectId,
      timestampMs: { gte: startMs, lte: endMs },
      level: { gte: 3 },
    };

    if (deviceMac) {
      where.deviceMac = deviceMac;
    }

    const events = await this.prisma.logEvent.findMany({
      where,
      orderBy: { timestampMs: 'asc' },
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        errorCode: true,
        deviceMac: true,
        linkCode: true,
      },
    });

    // Group by error code
    const byErrorCode = new Map<string, number>();
    for (const event of events) {
      const code = event.errorCode ?? 'UNKNOWN';
      byErrorCode.set(code, (byErrorCode.get(code) ?? 0) + 1);
    }

    // Group by event name
    const byEventName = new Map<string, number>();
    for (const event of events) {
      byEventName.set(
        event.eventName,
        (byEventName.get(event.eventName) ?? 0) + 1,
      );
    }

    // Group by level
    const byLevel = new Map<number, number>();
    for (const event of events) {
      byLevel.set(event.level, (byLevel.get(event.level) ?? 0) + 1);
    }

    const affectedSessions = new Set(
      events.filter((e) => e.linkCode).map((e) => e.linkCode),
    );
    const affectedDevices = new Set(
      events.filter((e) => e.deviceMac).map((e) => e.deviceMac),
    );

    const content = {
      totalErrors: events.length,
      byErrorCode: Array.from(byErrorCode.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
      byEventName: Array.from(byEventName.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      byLevel: Array.from(byLevel.entries())
        .map(([level, count]) => ({ level, count }))
        .sort((a, b) => b.level - a.level),
      affectedSessionsCount: affectedSessions.size,
      affectedDevicesCount: affectedDevices.size,
      sampleErrors: events.slice(0, 50).map((e) => ({
        id: e.id,
        eventName: e.eventName,
        level: e.level,
        timestampMs: Number(e.timestampMs),
        errorCode: e.errorCode,
      })),
    };

    const topError = Array.from(byErrorCode.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];
    const summary = `Error Distribution Report: ${events.length} total errors. Top error: ${topError?.[0] ?? 'N/A'} (${topError?.[1] ?? 0} occurrences). Affected ${affectedSessions.size} sessions and ${affectedDevices.size} devices.`;

    return { content, summary };
  }

  // List reports
  async listReports(params: {
    actorUserId: string;
    projectId: string;
    reportType?: ReportType;
    limit?: number;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const where: Prisma.AnalysisReportWhereInput = {
      projectId: params.projectId,
    };

    if (params.reportType) {
      where.reportType = params.reportType;
    }

    const reports = await this.prisma.analysisReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return { reports };
  }

  // Get report by ID
  async getReport(params: {
    actorUserId: string;
    projectId: string;
    id: string;
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    return this.prisma.analysisReport.findFirst({
      where: {
        id: params.id,
        projectId: params.projectId,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  // Export report as Markdown
  async exportReportAsMarkdown(params: {
    actorUserId: string;
    projectId: string;
    id: string;
  }) {
    const report = await this.getReport(params);
    if (!report) {
      return null;
    }

    const content = report.content as Record<string, unknown>;
    let markdown = `# ${report.title}\n\n`;
    markdown += `**Type:** ${report.reportType}\n`;
    markdown += `**Created:** ${report.createdAt.toISOString()}\n`;
    markdown += `**Created By:** ${report.creator?.name ?? 'Unknown'}\n\n`;
    markdown += `## Summary\n\n${report.summary ?? 'No summary available.'}\n\n`;
    markdown += `## Details\n\n\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\`\n`;

    return { markdown };
  }

  // Compare two sessions
  async compareSessions(params: {
    actorUserId: string;
    projectId: string;
    sessionA: {
      linkCode?: string;
      deviceMac?: string;
      startTime?: string;
      endTime?: string;
    };
    sessionB: {
      linkCode?: string;
      deviceMac?: string;
      startTime?: string;
      endTime?: string;
    };
  }) {
    await this.rbac.requireProjectRoles({
      userId: params.actorUserId,
      projectId: params.projectId,
      allowed: ['Admin', 'PM', 'Dev', 'QA', 'Release', 'Support', 'Viewer'],
    });

    const [eventsA, eventsB] = await Promise.all([
      this.getEventsForComparison(params.projectId, params.sessionA),
      this.getEventsForComparison(params.projectId, params.sessionB),
    ]);

    // Extract event names
    const eventNamesA = new Set(eventsA.map((e) => e.eventName));
    const eventNamesB = new Set(eventsB.map((e) => e.eventName));

    // Find common and different event types
    const commonEvents = [...eventNamesA].filter((n) => eventNamesB.has(n));
    const onlyInA = [...eventNamesA].filter((n) => !eventNamesB.has(n));
    const onlyInB = [...eventNamesB].filter((n) => !eventNamesA.has(n));

    // Count errors
    const errorsA = eventsA.filter((e) => e.level >= 4);
    const errorsB = eventsB.filter((e) => e.level >= 4);

    // Build timeline comparison
    const timeline: Array<{
      timestampMs: number;
      eventA: { eventName: string; level: number } | null;
      eventB: { eventName: string; level: number } | null;
      status: 'match' | 'diff' | 'only_a' | 'only_b';
    }> = [];

    let idxA = 0;
    let idxB = 0;

    while (idxA < eventsA.length || idxB < eventsB.length) {
      const eventA = eventsA[idxA];
      const eventB = eventsB[idxB];

      if (!eventA && eventB) {
        timeline.push({
          timestampMs: Number(eventB.timestampMs),
          eventA: null,
          eventB: { eventName: eventB.eventName, level: eventB.level },
          status: 'only_b',
        });
        idxB++;
      } else if (eventA && !eventB) {
        timeline.push({
          timestampMs: Number(eventA.timestampMs),
          eventA: { eventName: eventA.eventName, level: eventA.level },
          eventB: null,
          status: 'only_a',
        });
        idxA++;
      } else if (eventA && eventB) {
        if (eventA.eventName === eventB.eventName) {
          timeline.push({
            timestampMs: Number(eventA.timestampMs),
            eventA: { eventName: eventA.eventName, level: eventA.level },
            eventB: { eventName: eventB.eventName, level: eventB.level },
            status: eventA.level === eventB.level ? 'match' : 'diff',
          });
          idxA++;
          idxB++;
        } else {
          // Different events, add both
          timeline.push({
            timestampMs: Number(eventA.timestampMs),
            eventA: { eventName: eventA.eventName, level: eventA.level },
            eventB: null,
            status: 'only_a',
          });
          timeline.push({
            timestampMs: Number(eventB.timestampMs),
            eventA: null,
            eventB: { eventName: eventB.eventName, level: eventB.level },
            status: 'only_b',
          });
          idxA++;
          idxB++;
        }
      }

      // Limit timeline to 200 entries
      if (timeline.length >= 200) break;
    }

    return {
      summary: {
        aEventCount: eventsA.length,
        bEventCount: eventsB.length,
        aErrorCount: errorsA.length,
        bErrorCount: errorsB.length,
        commonEventTypes: commonEvents.length,
        diffEventTypes: onlyInA.length + onlyInB.length,
      },
      eventTypes: {
        common: commonEvents,
        onlyInA,
        onlyInB,
      },
      timeline: timeline.slice(0, 100),
    };
  }

  private async getEventsForComparison(
    projectId: string,
    session: {
      linkCode?: string;
      deviceMac?: string;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const where: Prisma.LogEventWhereInput = { projectId };

    if (session.linkCode) {
      where.linkCode = session.linkCode;
    }
    if (session.deviceMac) {
      where.deviceMac = session.deviceMac;
    }
    if (session.startTime && session.endTime) {
      where.timestampMs = {
        gte: BigInt(new Date(session.startTime).getTime()),
        lte: BigInt(new Date(session.endTime).getTime()),
      };
    }

    return this.prisma.logEvent.findMany({
      where,
      orderBy: { timestampMs: 'asc' },
      take: 500,
      select: {
        id: true,
        eventName: true,
        level: true,
        timestampMs: true,
        errorCode: true,
      },
    });
  }
}
