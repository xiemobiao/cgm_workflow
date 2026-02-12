'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import styles from './LogViewer.module.css';

type LogFileDetail = {
  id: string;
  projectId: string;
  fileName: string;
  status: 'queued' | 'parsed' | 'failed';
  parserVersion: string | null;
  uploadedAt: string;
  eventCount: number;
  errorCount: number;
  minTimestampMs: number | null;
  maxTimestampMs: number | null;
};

type SearchItem = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  sdkVersion: string | null;
  appId: string | null;
  logFileId: string;
  msg: string | null;
  threadName?: string | null;
};

type SearchResponse = { items: SearchItem[]; nextCursor: string | null };

type CssVars = { [key: `--${string}`]: string | number };
type StyleWithVars = CSSProperties & CssVars;

function hueVars(hue: number): StyleWithVars {
  return { '--hue': hue };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlighted(text: string, needle: string): ReactNode {
  const q = needle.trim();
  if (!q) return text;

  const re = new RegExp(escapeRegExp(q), 'ig');
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  let i = 0;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) out.push(text.slice(lastIndex, start));
    out.push(
      <mark key={`${start}-${i}`} className="bg-yellow-500/30 text-yellow-200">
        {text.slice(start, end)}
      </mark>,
    );
    lastIndex = end;
    i += 1;
    if (re.lastIndex === match.index) re.lastIndex += 1;
  }

  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out.length ? out : text;
}

function shortenText(value: string | null, maxLen: number) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}...`;
}

function hueForEvent(eventName: string) {
  if (eventName === 'PARSER_ERROR') return 2;
  let hash = 0;
  for (let i = 0; i < eventName.length; i += 1) {
    hash = (hash * 31 + eventName.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function formatTime(timestampMs: number, localeTag: string) {
  const date = new Date(timestampMs);
  return date.toLocaleTimeString(localeTag, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function formatDateTime(timestampMs: number, localeTag: string) {
  return new Date(timestampMs).toLocaleString(localeTag);
}

// Level badge colors
function getLevelBadgeClass(level: number): string {
  switch (level) {
    case 1:
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    case 2:
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 3:
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    case 4:
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    default:
      return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  }
}

export default function LogFileViewerPage() {
  const { localeTag, t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const fileId = typeof params.id === 'string' ? params.id : '';

  const [fileDetail, setFileDetail] = useState<LogFileDetail | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  const [eventName, setEventName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [level, setLevel] = useState<string>('');
  const [limit] = useState(100);

  // Infinite scroll state
  const [allItems, setAllItems] = useState<SearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);

  // Timeline slider state
  const [sliderValue, setSliderValue] = useState(0);
  const [sliderStartTime, setSliderStartTime] = useState<number | null>(null);
  const [, setPendingSliderTime] = useState<string | null>(null);

  const searchReqIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const sliderDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load file detail
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setFileLoading(true);
    setFileError('');
    setFileDetail(null);
    apiFetch<LogFileDetail>(`/api/logs/files/${fileId}`)
      .then((data) => {
        if (cancelled) return;
        setFileDetail(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setFileError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const timeRange = useMemo(() => {
    const now = Date.now();
    const uploadedAtMs = fileDetail?.uploadedAt
      ? new Date(fileDetail.uploadedAt).getTime()
      : now;
    const fallbackStart = uploadedAtMs - 60 * 1000;
    const startMs = fileDetail?.minTimestampMs ?? fallbackStart;
    const endMs = fileDetail?.maxTimestampMs ?? now;
    const safeStart = Number.isFinite(startMs) ? startMs : fallbackStart;
    const safeEnd = Number.isFinite(endMs) ? endMs : now;
    const fixedEnd = safeEnd <= safeStart ? safeStart + 1 : safeEnd;
    return {
      startMs: safeStart,
      endMs: fixedEnd,
      startTime: new Date(safeStart).toISOString(),
      endTime: new Date(fixedEnd).toISOString(),
    };
  }, [fileDetail?.maxTimestampMs, fileDetail?.minTimestampMs, fileDetail?.uploadedAt]);

  // Fetch data function
  const fetchData = useCallback(
    async (cursor: string | null, append: boolean, customStartTime?: string) => {
      if (!fileId || !fileDetail) return;
      const reqId = (searchReqIdRef.current += 1);
      setLoading(true);
      setError('');
      try {
        const projectId = fileDetail.projectId || getProjectId() || '';
        if (!projectId) {
          setError('Missing projectId');
          return;
        }

        const startTime = customStartTime || timeRange.startTime;

        const qs = new URLSearchParams({
          projectId,
          logFileId: fileId,
          startTime,
          endTime: timeRange.endTime,
          limit: String(limit),
        });
        if (eventName.trim()) qs.set('eventName', eventName.trim());
        if (keyword.trim()) qs.set('q', keyword.trim());
        qs.set('direction', 'asc');
        if (level) qs.set('level', level);
        if (cursor) qs.set('cursor', cursor);

        const data = await apiFetch<SearchResponse>(`/api/logs/events/search?${qs.toString()}`);
        if (reqId !== searchReqIdRef.current) return;

        if (append) {
          setAllItems((prev) => [...prev, ...data.items]);
        } else {
          setAllItems(data.items);
        }
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      } catch (e: unknown) {
        if (reqId !== searchReqIdRef.current) return;
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setError(msg);
      } finally {
        if (reqId === searchReqIdRef.current) {
          setLoading(false);
          setInitialLoading(false);
        }
      }
    },
    [fileId, fileDetail, timeRange, eventName, keyword, level, limit],
  );

  // Load more function for infinite scroll
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !nextCursor) return;
    await fetchData(nextCursor, true);
  }, [loading, hasMore, nextCursor, fetchData]);

  loadMoreRef.current = loadMore;

  // Initial load
  useEffect(() => {
    if (!fileDetail?.id) return;
    setInitialLoading(true);
    setAllItems([]);
    setNextCursor(null);
    setHasMore(true);
    setSliderValue(0);
    setSliderStartTime(null);
    void fetchData(null, false);
  }, [fileDetail?.id, fetchData]);

  // Search handler
  const runSearch = useCallback(() => {
    setAllItems([]);
    setNextCursor(null);
    setHasMore(true);
    setSliderValue(0);
    setSliderStartTime(null);
    void fetchData(null, false);
  }, [fetchData]);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMoreRef.current();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Slider change handler with debounce
  const handleSliderChange = useCallback(
    (values: number[]) => {
      const value = values[0];
      setSliderValue(value);

      // Calculate timestamp based on slider position
      const range = timeRange.endMs - timeRange.startMs;
      const targetTime = timeRange.startMs + (range * value) / 100;
      setSliderStartTime(targetTime);

      // Calculate the start time for API
      const startTime = new Date(targetTime).toISOString();
      setPendingSliderTime(startTime);

      // Clear previous debounce timer
      if (sliderDebounceRef.current) {
        clearTimeout(sliderDebounceRef.current);
      }

      // Set new debounce timer - trigger fetch 300ms after user stops dragging
      sliderDebounceRef.current = setTimeout(() => {
        setPendingSliderTime(null);
        setInitialLoading(true);
        setAllItems([]);
        setNextCursor(null);
        setHasMore(true);
        setError('');
        void fetchData(null, false, startTime);
      }, 300);
    },
    [timeRange, fetchData],
  );

  // Slider commit handler (when user releases) - immediate fetch
  const handleSliderCommit = useCallback(
    (values: number[]) => {
      // Clear any pending debounce
      if (sliderDebounceRef.current) {
        clearTimeout(sliderDebounceRef.current);
        sliderDebounceRef.current = null;
      }

      const value = values[0];
      const range = timeRange.endMs - timeRange.startMs;
      const targetTime = timeRange.startMs + (range * value) / 100;
      const startTime = new Date(targetTime).toISOString();

      // Always fetch on commit to ensure data is updated
      setPendingSliderTime(null);
      setInitialLoading(true);
      setAllItems([]);
      setNextCursor(null);
      setHasMore(true);
      setError('');
      void fetchData(null, false, startTime);
    },
    [timeRange, fetchData],
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (sliderDebounceRef.current) {
        clearTimeout(sliderDebounceRef.current);
      }
    };
  }, []);

  // Reset handler
  const handleReset = useCallback(() => {
    setEventName('');
    setKeyword('');
    setLevel('');
    setSliderValue(0);
    setSliderStartTime(null);
    setAllItems([]);
    setNextCursor(null);
    setHasMore(true);
    void fetchData(null, false);
  }, [fetchData]);

  // Navigate to event detail
  const handleRowClick = useCallback(
    (eventId: string) => {
      router.push(`/logs/events/${eventId}`);
    },
    [router],
  );

  // Current slider time display
  const sliderTimeDisplay = useMemo(() => {
    if (sliderStartTime !== null) {
      return formatDateTime(sliderStartTime, localeTag);
    }
    return formatDateTime(timeRange.startMs, localeTag);
  }, [sliderStartTime, timeRange.startMs, localeTag]);

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/logs/files/${fileId}`}>{t('common.back')}</Link>
          </Button>
          <div className="text-sm text-muted-foreground truncate max-w-[300px]">
            {fileDetail?.fileName || fileId}
          </div>
          {fileDetail && (
            <div className="text-xs text-muted-foreground">
              {t('common.items', { count: fileDetail.eventCount })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/logs/files">{t('logs.files.title')}</Link>
          </Button>
        </div>
      </div>

      {fileLoading && <div className="text-muted-foreground">{t('common.loading')}</div>}
      {fileError && <div className="text-red-400">{fileError}</div>}

      {fileDetail && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap bg-card/50 rounded-lg p-3 border border-border/50">
            <Input
              className="w-48"
              placeholder={t('logs.eventNameOptional')}
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
            />
            <select
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">{t('logs.level.all')}</option>
              <option value="1">Level 1</option>
              <option value="2">Level 2</option>
              <option value="3">Level 3</option>
              <option value="4">Level 4</option>
            </select>
            <Input
              className="flex-1 min-w-[200px]"
              placeholder={t('logs.keyword')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
            />
            <Button variant="default" size="sm" onClick={runSearch} disabled={loading}>
              {t('common.search')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={loading}>
              {t('common.reset')}
            </Button>
            <div className="text-xs text-muted-foreground ml-auto">
              {loading ? t('common.loading') : t('logs.files.viewerLoaded', { loaded: allItems.length, total: fileDetail.eventCount })}
            </div>
          </div>

          {/* Timeline slider */}
          <div className="flex items-center gap-4 bg-card/30 rounded-lg p-3 border border-border/30">
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDateTime(timeRange.startMs, localeTag)}
            </div>
            <Slider
              className="flex-1"
              value={[sliderValue]}
              min={0}
              max={100}
              step={0.1}
              onValueChange={handleSliderChange}
              onValueCommit={handleSliderCommit}
            />
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDateTime(timeRange.endMs, localeTag)}
            </div>
            <div className="text-xs bg-primary/20 text-primary px-2 py-1 rounded whitespace-nowrap">
              {sliderTimeDisplay}
            </div>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          {/* Table */}
          <div className="flex-1 overflow-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-32">{t('logs.time')}</TableHead>
                  <TableHead className="w-40">{t('logs.eventName')}</TableHead>
                  <TableHead className="w-20">{t('logs.level')}</TableHead>
                  <TableHead className="w-24">{t('logs.thread')}</TableHead>
                  <TableHead>{t('logs.message')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('common.loading')}
                    </TableCell>
                  </TableRow>
                ) : allItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('logs.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  allItems.map((item) => {
                    const hue = hueForEvent(item.eventName);
                    return (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => handleRowClick(item.id)}
                      >
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {formatTime(item.timestampMs, localeTag)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={styles.eventBadge}
                            style={hueVars(hue)}
                          >
                            <span className={styles.eventBadgeDot} />
                            {renderHighlighted(item.eventName, keyword)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${getLevelBadgeClass(item.level)}`}>
                            Lv{item.level}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.threadName || 'main'}
                        </TableCell>
                        <TableCell className="text-sm max-w-md truncate">
                          {item.msg ? renderHighlighted(shortenText(item.msg, 100), keyword) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-px" />

            {/* Loading more indicator */}
            {loading && !initialLoading && (
              <div className="text-center py-4 text-muted-foreground">
                {t('common.loading')}
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && allItems.length > 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {t('logs.files.viewerEnd')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
