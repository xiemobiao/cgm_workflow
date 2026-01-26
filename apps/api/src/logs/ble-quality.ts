import { BLE_FLOW_PAIR_CHECKS, BLE_REQUIRED_EVENTS } from './ble-required-events';

export type LoganDecryptStats = {
  blocksTotal: number;
  blocksSucceeded: number;
  blocksFailed: number;
};

export type LogEventStatsRow = {
  eventName: string;
  level: number;
  count: number;
};

export type BleQualityItemStatus =
  | 'ok'
  | 'missing'
  | 'level_mismatch'
  | 'name_mismatch';

export type BleQualityItem = {
  category: string;
  description: string;
  eventName: string;
  expectedLevel: 1 | 2 | 3 | 4;
  expectedLevelLabel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  status: BleQualityItemStatus;
  totalCount: number;
  expectedLevelCount: number;
  countsByLevel: Record<'1' | '2' | '3' | '4', number>;
  matchedEventNames?: string[];
};

export type BlePairCheckResult = {
  name: string;
  startEventName: string;
  endEventNames: string[];
  startCount: number;
  endCount: number;
  pendingCount: number;
};

export type BleQualityReport = {
  summary: {
    requiredTotal: number;
    okTotal: number;
    missingTotal: number;
    levelMismatchTotal: number;
    nameMismatchTotal: number;
    coverageRatio: number;
  };
  byCategory: Array<{
    category: string;
    requiredTotal: number;
    okTotal: number;
    missingTotal: number;
    levelMismatchTotal: number;
    nameMismatchTotal: number;
  }>;
  requiredEvents: BleQualityItem[];
  pairChecks: BlePairCheckResult[];
  parser: {
    parserErrorCount: number;
    logan: LoganDecryptStats | null;
  };
};

type AggregatedEventCounts = {
  totalCount: number;
  countsByLevel: Record<'1' | '2' | '3' | '4', number>;
};

function normalizeEventName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function levelLabel(level: 1 | 2 | 3 | 4): 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' {
  switch (level) {
    case 1:
      return 'DEBUG';
    case 2:
      return 'INFO';
    case 3:
      return 'WARN';
    case 4:
      return 'ERROR';
  }
}

function emptyCounts(): Record<'1' | '2' | '3' | '4', number> {
  return { '1': 0, '2': 0, '3': 0, '4': 0 };
}

function addCounts(
  acc: Record<'1' | '2' | '3' | '4', number>,
  level: number,
  count: number,
) {
  const key = String(level) as '1' | '2' | '3' | '4';
  if (!acc[key]) acc[key] = 0;
  acc[key] += count;
}

export function buildBleQualityReport(params: {
  stats: LogEventStatsRow[];
  parserErrorCount: number;
  logan: LoganDecryptStats | null;
}): BleQualityReport {
  const byEventName = new Map<string, AggregatedEventCounts>();
  const byNormalizedName = new Map<string, Set<string>>();

  for (const row of params.stats) {
    if (!row.eventName) continue;
    const existing = byEventName.get(row.eventName) ?? {
      totalCount: 0,
      countsByLevel: emptyCounts(),
    };
    existing.totalCount += row.count;
    addCounts(existing.countsByLevel, row.level, row.count);
    byEventName.set(row.eventName, existing);

    const norm = normalizeEventName(row.eventName);
    const set = byNormalizedName.get(norm) ?? new Set<string>();
    set.add(row.eventName);
    byNormalizedName.set(norm, set);
  }

  const aggregateCountsByExpectedName = (expectedName: string): AggregatedEventCounts | null => {
    const exact = byEventName.get(expectedName);
    if (exact) return exact;

    const norm = normalizeEventName(expectedName);
    const matched = byNormalizedName.get(norm);
    if (!matched || matched.size === 0) return null;

    const merged: AggregatedEventCounts = {
      totalCount: 0,
      countsByLevel: emptyCounts(),
    };
    for (const name of matched.values()) {
      const counts = byEventName.get(name);
      if (!counts) continue;
      merged.totalCount += counts.totalCount;
      merged.countsByLevel['1'] += counts.countsByLevel['1'] ?? 0;
      merged.countsByLevel['2'] += counts.countsByLevel['2'] ?? 0;
      merged.countsByLevel['3'] += counts.countsByLevel['3'] ?? 0;
      merged.countsByLevel['4'] += counts.countsByLevel['4'] ?? 0;
    }
    return merged.totalCount > 0 ? merged : null;
  };

  const aggregateTotalCount = (expectedName: string): number => {
    const counts = aggregateCountsByExpectedName(expectedName);
    return counts?.totalCount ?? 0;
  };

  const byCategory = new Map<
    string,
    {
      requiredTotal: number;
      okTotal: number;
      missingTotal: number;
      levelMismatchTotal: number;
      nameMismatchTotal: number;
    }
  >();

  const requiredEvents: BleQualityItem[] = BLE_REQUIRED_EVENTS.map((e) => {
    const categoryAgg = byCategory.get(e.category) ?? {
      requiredTotal: 0,
      okTotal: 0,
      missingTotal: 0,
      levelMismatchTotal: 0,
      nameMismatchTotal: 0,
    };
    categoryAgg.requiredTotal += 1;
    byCategory.set(e.category, categoryAgg);

    const exact = byEventName.get(e.eventName);
    if (exact) {
      const expectedKey = String(e.expectedLevel) as '1' | '2' | '3' | '4';
      const expectedLevelCount = exact.countsByLevel[expectedKey] ?? 0;
      const status: BleQualityItemStatus =
        expectedLevelCount > 0 ? 'ok' : 'level_mismatch';

      if (status === 'ok') categoryAgg.okTotal += 1;
      else categoryAgg.levelMismatchTotal += 1;

      return {
        category: e.category,
        description: e.description,
        eventName: e.eventName,
        expectedLevel: e.expectedLevel,
        expectedLevelLabel: levelLabel(e.expectedLevel),
        status,
        totalCount: exact.totalCount,
        expectedLevelCount,
        countsByLevel: exact.countsByLevel,
      };
    }

    const norm = normalizeEventName(e.eventName);
    const matched = byNormalizedName.get(norm);
    if (matched && matched.size > 0) {
      const aggregated = aggregateCountsByExpectedName(e.eventName);
      categoryAgg.nameMismatchTotal += 1;
      return {
        category: e.category,
        description: e.description,
        eventName: e.eventName,
        expectedLevel: e.expectedLevel,
        expectedLevelLabel: levelLabel(e.expectedLevel),
        status: 'name_mismatch',
        totalCount: aggregated?.totalCount ?? 0,
        expectedLevelCount: 0,
        countsByLevel: aggregated?.countsByLevel ?? emptyCounts(),
        matchedEventNames: Array.from(matched.values()).slice(0, 10),
      };
    }

    categoryAgg.missingTotal += 1;
    return {
      category: e.category,
      description: e.description,
      eventName: e.eventName,
      expectedLevel: e.expectedLevel,
      expectedLevelLabel: levelLabel(e.expectedLevel),
      status: 'missing',
      totalCount: 0,
      expectedLevelCount: 0,
      countsByLevel: emptyCounts(),
    };
  });

  const pairChecks: BlePairCheckResult[] = BLE_FLOW_PAIR_CHECKS.map((rule) => {
    const startCount = aggregateTotalCount(rule.startEventName);
    const endCount = rule.endEventNames.reduce((sum, endName) => {
      return sum + aggregateTotalCount(endName);
    }, 0);
    const pendingCount = Math.max(startCount - endCount, 0);
    return {
      name: rule.name,
      startEventName: rule.startEventName,
      endEventNames: rule.endEventNames,
      startCount,
      endCount,
      pendingCount,
    };
  });

  const summary = requiredEvents.reduce(
    (acc, item) => {
      acc.requiredTotal += 1;
      if (item.status === 'ok') acc.okTotal += 1;
      if (item.status === 'missing') acc.missingTotal += 1;
      if (item.status === 'level_mismatch') acc.levelMismatchTotal += 1;
      if (item.status === 'name_mismatch') acc.nameMismatchTotal += 1;
      return acc;
    },
    {
      requiredTotal: 0,
      okTotal: 0,
      missingTotal: 0,
      levelMismatchTotal: 0,
      nameMismatchTotal: 0,
      coverageRatio: 0,
    },
  );

  summary.coverageRatio =
    summary.requiredTotal > 0 ? summary.okTotal / summary.requiredTotal : 0;

  return {
    summary,
    byCategory: Array.from(byCategory.entries()).map(([category, agg]) => ({
      category,
      ...agg,
    })),
    requiredEvents,
    pairChecks,
    parser: {
      parserErrorCount: params.parserErrorCount,
      logan: params.logan,
    },
  };
}
