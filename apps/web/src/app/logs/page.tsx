'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Search,
  ChevronRight,
  X,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  FileText,
  GitBranch,
  BarChart3,
  Filter,
} from 'lucide-react';
import { ProjectPicker } from '@/components/ProjectPicker';
import { ApiClientError, apiFetch } from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import { getProjectId, getToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { getActiveLogFileId, setActiveLogFileId } from '@/lib/log-file-scope';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, PageHeaderActionButton } from '@/components/ui/page-header';
import { fadeIn } from '@/lib/animations';
import { cn } from '@/lib/utils';

type UploadResponse = { logFileId: string; status: string };
type SearchItem = {
  id: string;
  eventName: string;
  level: number;
  timestampMs: number;
  sdkVersion: string | null;
  appId: string | null;
  logFileId: string;
  msg: string | null;
  linkCode: string | null;
  requestId: string | null;
  attemptId: string | null;
  deviceMac: string | null;
  deviceSn: string | null;
  errorCode: string | null;
  reasonCode: string | null;
};
type SearchResponse = { items: SearchItem[]; nextCursor: string | null };
type EventContextResponse = {
  logFileId: string;
  before: SearchItem[];
  after: SearchItem[];
};

type LogFileDetail = {
  id: string;
  fileName: string;
  status: 'queued' | 'parsed' | 'failed';
  parserVersion: string | null;
  uploadedAt: string;
  eventCount: number;
  errorCount: number;
  minTimestampMs: number | null;
  maxTimestampMs: number | null;
};

type LogEventDetail = {
  id: string;
  logFileId: string;
  timestampMs: number;
  level: number;
  eventName: string;
  sdkVersion: string | null;
  appId: string | null;
  terminalInfo: string | null;
  threadName: string | null;
  threadId: number | null;
  isMainThread: boolean | null;
  msg: string | null;
  msgJson: unknown | null;
  rawLine: string | null;
  linkCode: string | null;
  requestId: string | null;
  attemptId: string | null;
  deviceMac: string | null;
  deviceSn: string | null;
  errorCode: string | null;
  reasonCode: string | null;
  createdAt: string;
};

const MAX_RESULTS_PER_PAGE = 200;

function toIsoFromDatetimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shortenText(value: string | null, maxLen: number) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}...`;
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
      <mark key={`${start}-${i}`} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
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

function getLevelBadge(level: number) {
  switch (level) {
    case 1:
      return <Badge variant="secondary" className="text-xs">DEBUG</Badge>;
    case 2:
      return <Badge variant="info" className="text-xs">INFO</Badge>;
    case 3:
      return <Badge variant="warning" className="text-xs">WARN</Badge>;
    case 4:
      return <Badge variant="destructive" className="text-xs">ERROR</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{level}</Badge>;
  }
}

export default function LogsPage() {
  const { localeTag, t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState('');
  const [uploadedLogFileId, setUploadedLogFileId] = useState<string | null>(null);
  const [uploadedLogFile, setUploadedLogFile] = useState<LogFileDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [eventName, setEventName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [logFileId, setLogFileId] = useState('');
  const [level, setLevel] = useState<string>('');
  const [levelGte, setLevelGte] = useState<string>('');
  const [sdkVersion, setSdkVersion] = useState('');
  const [appId, setAppId] = useState('');
  const [linkCode, setLinkCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [stage, setStage] = useState('');
  const [op, setOp] = useState('');
  const [flowResult, setFlowResult] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [deviceSn, setDeviceSn] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [msgContains, setMsgContains] = useState('');
  const [limit, setLimit] = useState(50);
  const [excludeNoisy, setExcludeNoisy] = useState(true);
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [autoSearch, setAutoSearch] = useState(false);
  const [urlSyncReady, setUrlSyncReady] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [context, setContext] = useState<EventContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [copyHint, setCopyHint] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<
    (
      resetCursor: boolean,
      range?: { startLocal: string; endLocal: string },
    ) => Promise<void>
  >(async () => {});
  const lastProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectId(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const canSearch = useMemo(() => Boolean(projectId), [projectId]);
  const enableRowAnimations = results.length <= MAX_RESULTS_PER_PAGE;

  useEffect(() => {
    if (!projectId) return;
    const previousProjectId = lastProjectIdRef.current;
    if (previousProjectId === projectId) return;
    lastProjectIdRef.current = projectId;

    const stored = getActiveLogFileId(projectId);
    const nextLogFileId = stored && isUuid(stored) ? stored : '';

    // When switching projects, avoid keeping a logFileId from another project.
    if (previousProjectId && previousProjectId !== projectId) {
      setLogFileId(nextLogFileId);
      return;
    }

    // Initial restore (only if URL didn't already provide one).
    if (!logFileId.trim() && nextLogFileId) {
      setLogFileId(nextLogFileId);
    }
  }, [projectId, logFileId]);

  useEffect(() => {
    if (!projectId) return;
    setActiveLogFileId(projectId, logFileId.trim() || null);
  }, [projectId, logFileId]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const startMs = Number(sp.get('startMs') ?? '');
    const endMs = Number(sp.get('endMs') ?? '');
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      setStartLocal(formatDatetimeLocal(new Date(startMs)));
      setEndLocal(formatDatetimeLocal(new Date(endMs)));
      return;
    }

    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlLogFileId = sp.get('logFileId');
    if (urlLogFileId && isUuid(urlLogFileId)) setLogFileId(urlLogFileId);
    const urlEventName = sp.get('eventName');
    if (urlEventName) setEventName(urlEventName);
    const urlKeyword = sp.get('q');
    if (urlKeyword) setKeyword(urlKeyword);
    const urlSdkVersion = sp.get('sdkVersion');
    if (urlSdkVersion) setSdkVersion(urlSdkVersion);
    const urlAppId = sp.get('appId');
    if (urlAppId) setAppId(urlAppId);
    const urlLevel = sp.get('level');
    if (urlLevel) setLevel(urlLevel);
    const urlLevelGte = sp.get('levelGte');
    if (urlLevelGte) setLevelGte(urlLevelGte);
    const urlLinkCode = sp.get('linkCode');
    if (urlLinkCode) setLinkCode(urlLinkCode);
    const urlRequestId = sp.get('requestId');
    if (urlRequestId) setRequestId(urlRequestId);
    const urlStage = sp.get('stage');
    if (urlStage) setStage(urlStage);
    const urlOp = sp.get('op');
    if (urlOp) setOp(urlOp);
    const urlFlowResult = sp.get('result');
    if (urlFlowResult) setFlowResult(urlFlowResult);
    const urlDeviceMac = sp.get('deviceMac');
    if (urlDeviceMac) setDeviceMac(urlDeviceMac);
    const urlDeviceSn = sp.get('deviceSn');
    if (urlDeviceSn) setDeviceSn(urlDeviceSn);
    const urlErrorCode = sp.get('errorCode');
    if (urlErrorCode) setErrorCode(urlErrorCode);
    const urlReasonCode = sp.get('reasonCode');
    if (urlReasonCode) setReasonCode(urlReasonCode);
    const urlMsgContains = sp.get('msgContains');
    if (urlMsgContains) setMsgContains(urlMsgContains);
    const urlExcludeNoisy = sp.get('excludeNoisy');
    if (urlExcludeNoisy === 'true') setExcludeNoisy(true);
    if (urlExcludeNoisy === 'false') setExcludeNoisy(false);
    const urlLimit = Number(sp.get('limit') ?? '');
    if (Number.isFinite(urlLimit) && urlLimit >= 1 && urlLimit <= MAX_RESULTS_PER_PAGE) {
      setLimit(Math.trunc(urlLimit));
    }

    const startMs = Number(sp.get('startMs') ?? '');
    const endMs = Number(sp.get('endMs') ?? '');
    const hasRange = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
    if (
      urlEventName ||
      urlSdkVersion ||
      urlAppId ||
      urlLevel ||
      urlLevelGte ||
      urlLinkCode ||
      urlRequestId ||
      urlStage ||
      urlOp ||
      urlFlowResult ||
      urlDeviceMac ||
      urlDeviceSn ||
      urlErrorCode ||
      urlReasonCode ||
      urlMsgContains
    ) {
      setShowFilters(true);
    }
    if (
      (urlLogFileId && isUuid(urlLogFileId)) ||
      urlEventName ||
      urlKeyword ||
      hasRange ||
      urlSdkVersion ||
      urlAppId ||
      urlLevel ||
      urlLevelGte ||
      urlLinkCode ||
      urlRequestId ||
      urlStage ||
      urlOp ||
      urlFlowResult ||
      urlDeviceMac ||
      urlDeviceSn ||
      urlErrorCode ||
      urlReasonCode ||
      urlMsgContains
    ) {
      setAutoSearch(true);
    }
  }, []);

  useEffect(() => {
    const fromUrl = Number(new URLSearchParams(window.location.search).get('limit') ?? '');
    if (Number.isFinite(fromUrl) && fromUrl >= 1 && fromUrl <= MAX_RESULTS_PER_PAGE) {
      setLimit(Math.trunc(fromUrl));
      return;
    }
    const saved = localStorage.getItem('cgm_logs_limit');
    const n = saved ? Number(saved) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= MAX_RESULTS_PER_PAGE) {
      setLimit(Math.trunc(n));
    }
  }, []);

  useEffect(() => {
    if (urlSyncReady) return;
    if (!startLocal || !endLocal) return;
    setUrlSyncReady(true);
  }, [urlSyncReady, startLocal, endLocal]);

  useEffect(() => {
    if (!urlSyncReady) return;
    const sp = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => {
      if (value) {
        sp.set(key, value);
      } else {
        sp.delete(key);
      }
    };

    setOrDelete('eventName', eventName.trim());
    setOrDelete('logFileId', logFileId.trim());
    setOrDelete('q', keyword.trim());
    setOrDelete('sdkVersion', sdkVersion.trim());
    setOrDelete('appId', appId.trim());
    setOrDelete('level', level.trim());
    setOrDelete('levelGte', levelGte.trim());
    setOrDelete('linkCode', linkCode.trim());
    setOrDelete('requestId', requestId.trim());
    setOrDelete('stage', stage.trim());
    setOrDelete('op', op.trim());
    setOrDelete('result', flowResult.trim());
    setOrDelete('deviceMac', deviceMac.trim());
    setOrDelete('deviceSn', deviceSn.trim());
    setOrDelete('errorCode', errorCode.trim());
    setOrDelete('reasonCode', reasonCode.trim());
    setOrDelete('msgContains', msgContains.trim());
    sp.set('excludeNoisy', excludeNoisy ? 'true' : 'false');
    sp.set('limit', String(limit));

    const startMs = new Date(startLocal).getTime();
    const endMs = new Date(endLocal).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      sp.set('startMs', String(startMs));
      sp.set('endMs', String(endMs));
    } else {
      sp.delete('startMs');
      sp.delete('endMs');
    }
    sp.delete('startTime');
    sp.delete('endTime');

    const next = sp.toString();
    const current = window.location.search.startsWith('?')
      ? window.location.search.slice(1)
      : '';
    if (next === current) return;
    const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [
    urlSyncReady,
    eventName,
    logFileId,
    keyword,
    sdkVersion,
    appId,
    level,
    levelGte,
    linkCode,
    requestId,
    stage,
    op,
    flowResult,
    deviceMac,
    deviceSn,
    errorCode,
    reasonCode,
    msgContains,
    excludeNoisy,
    limit,
    startLocal,
    endLocal,
  ]);

  useEffect(() => {
    localStorage.setItem('cgm_logs_limit', String(limit));
  }, [limit]);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    setDetail(null);
    setDetailError('');
    setContext(null);
    setContextError('');
    setCopyHint('');
    setDetailLoading(true);
    apiFetch<LogEventDetail>(`/api/logs/events/${selectedEventId}`)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setDetailError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    setContext(null);
    setContextError('');
    setContextLoading(true);
    apiFetch<EventContextResponse>(`/api/logs/events/${selectedEventId}/context?before=8&after=8`)
      .then((data) => {
        if (cancelled) return;
        setContext(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setContextError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!uploadedLogFileId) return;

    let cancelled = false;
    let timer: number | null = null;
    let tries = 0;

    const poll = async () => {
      tries += 1;
      try {
        const info = await apiFetch<LogFileDetail>(`/api/logs/files/${uploadedLogFileId}`);
        if (cancelled) return;
        setUploadedLogFile(info);

        if (info.status !== 'queued' || tries >= 30) {
          if (timer) window.clearInterval(timer);
        }
      } catch {
        if (cancelled) return;
        if (tries >= 5 && timer) window.clearInterval(timer);
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), 1200);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [uploadedLogFileId]);

  function setPresetRange(hours: number) {
    const now = new Date();
    setEndLocal(formatDatetimeLocal(now));
    setStartLocal(formatDatetimeLocal(new Date(now.getTime() - hours * 60 * 60 * 1000)));
  }

  function prettyJson(value: unknown) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyHint(t('common.copied'));
    } catch {
      setCopyHint(t('common.copyFailed'));
    }
  }

  async function upload() {
    if (!projectId || !file) return;
    setLoading(true);
    setError('');
    setUploadResult('');
    setUploadedLogFileId(null);
    setUploadedLogFile(null);
    try {
      const token = getToken();
      if (!token) throw new Error('Missing token');

      const form = new FormData();
      form.set('projectId', projectId);
      form.set('file', file);

      const res = await fetch(`${API_BASE_URL}/api/logs/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = (await res.json()) as unknown;
      if (!json || typeof json !== 'object') {
        throw new Error(`Invalid response (${res.status})`);
      }
      const body = json as {
        success: boolean;
        data: UploadResponse | null;
        error: { code: string; message: string } | null;
      };
      if (!body.success || !body.data) {
        throw new Error(`${body.error?.code ?? `HTTP_${res.status}`}: ${body.error?.message ?? 'Upload failed'}`);
      }

      setUploadResult(`logFileId=${body.data.logFileId}, status=${body.data.status}`);
      setUploadedLogFileId(body.data.logFileId);
      setLogFileId(body.data.logFileId);
      const now = new Date();
      const end = formatDatetimeLocal(now);
      const start = formatDatetimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      setStartLocal(start);
      setEndLocal(end);

      // Wait for file parsing to complete before searching
      const uploadedId = body.data.logFileId;
      const waitForParsed = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => window.setTimeout(r, 1000));
          try {
            const info = await apiFetch<LogFileDetail>(`/api/logs/files/${uploadedId}`);
            if (info.status === 'parsed' || info.status === 'failed') {
              if (info.status === 'parsed') {
                void search(true, { startLocal: start, endLocal: end });
              }
              return;
            }
          } catch {
            // ignore and retry
          }
        }
      };
      void waitForParsed();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function search(resetCursor: boolean, range?: { startLocal: string; endLocal: string }) {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const startValue = range?.startLocal ?? startLocal;
      const endValue = range?.endLocal ?? endLocal;
      if (!startValue || !endValue) {
        setError(t('logs.timeRangeRequired'));
        return;
      }
      const startMs = new Date(startValue).getTime();
      const endMs = new Date(endValue).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        setError(t('logs.timeRangeRequired'));
        return;
      }
      if (endMs <= startMs) {
        setError(t('logs.invalidTimeRange'));
        return;
      }

      const trimmedLogFileId = logFileId.trim();
      if (trimmedLogFileId && !isUuid(trimmedLogFileId)) {
        setError(t('logs.invalidLogFileId'));
        return;
      }

      const startTime = toIsoFromDatetimeLocal(startValue);
      const endTime = toIsoFromDatetimeLocal(endValue);
      const qs = new URLSearchParams({
        projectId,
        startTime,
        endTime,
      });
      if (eventName.trim()) qs.set('eventName', eventName.trim());
      if (trimmedLogFileId) qs.set('logFileId', trimmedLogFileId);
      if (keyword.trim()) qs.set('q', keyword.trim());
      if (sdkVersion.trim()) qs.set('sdkVersion', sdkVersion.trim());
      if (appId.trim()) qs.set('appId', appId.trim());
      if (level) qs.set('level', level);
      if (levelGte) qs.set('levelGte', levelGte);
      if (linkCode.trim()) qs.set('linkCode', linkCode.trim());
      if (requestId.trim()) qs.set('requestId', requestId.trim());
      if (stage.trim()) qs.set('stage', stage.trim());
      if (op.trim()) qs.set('op', op.trim());
      if (flowResult.trim()) qs.set('result', flowResult.trim());
      if (deviceMac.trim()) qs.set('deviceMac', deviceMac.trim());
      if (deviceSn.trim()) qs.set('deviceSn', deviceSn.trim());
      if (errorCode.trim()) qs.set('errorCode', errorCode.trim());
      if (reasonCode.trim()) qs.set('reasonCode', reasonCode.trim());
      if (msgContains.trim()) qs.set('msgContains', msgContains.trim());
      if (excludeNoisy) qs.set('excludeNoisy', 'true');
      qs.set('limit', String(limit));
      if (!resetCursor && cursor) qs.set('cursor', cursor);

      const data = await apiFetch<SearchResponse>(`/api/logs/events/search?${qs.toString()}`);
      if (resetCursor) {
        setCursor(null);
        setNextCursor(null);
        setResults(data.items);
      } else {
        setResults((prev) => [...prev, ...data.items]);
      }
      setNextCursor(data.nextCursor);
      setCursor(data.nextCursor);
    } catch (e: unknown) {
      const msg = e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  searchRef.current = search;

  useEffect(() => {
    if (!autoSearch) return;
    if (!projectId) return;
    if (!startLocal || !endLocal) return;
    setAutoSearch(false);
    void searchRef.current(true);
  }, [
    autoSearch,
    projectId,
    startLocal,
    endLocal,
    keyword,
    logFileId,
    stage,
    op,
    flowResult,
    errorCode,
    reasonCode,
  ]);

  const buildQuickLinkHref = (base: string) => {
    const qs = new URLSearchParams();
    if (projectId.trim()) qs.set('projectId', projectId.trim());
    if (logFileId.trim()) qs.set('logFileId', logFileId.trim());
    if (startLocal && endLocal) {
      qs.set('startTime', toIsoFromDatetimeLocal(startLocal));
      qs.set('endTime', toIsoFromDatetimeLocal(endLocal));
    }
    return qs.size ? `${base}?${qs.toString()}` : base;
  };

  const quickLinks = [
    { href: buildQuickLinkHref('/logs/trace'), icon: GitBranch, label: t('logs.trace') },
    { href: buildQuickLinkHref('/logs/commands'), icon: BarChart3, label: t('logs.commands') },
    { href: '/logs/files', icon: FileText, label: t('logs.files.browse') },
  ];

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 p-6">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
      >
        <PageHeader
          title={t('logs.title')}
          subtitle={t('logs.uploadHint')}
          actions={(
            <>
              {quickLinks.map((link) => (
                <PageHeaderActionButton key={link.href} asChild className="gap-2">
                  <Link href={link.href}>
                    <link.icon size={16} />
                    <span>{link.label}</span>
                  </Link>
                </PageHeaderActionButton>
              ))}
            </>
          )}
        />
      </motion.div>

      {/* Project & Upload Section */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-white/[0.08]">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <ProjectPicker projectId={projectId} onChange={setProjectId} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  {t('logs.uploadTitle')}
                </label>
                <Input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="cursor-pointer"
                />
              </div>
              <Button
                onClick={() => void upload()}
                disabled={!projectId || !file || loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload size={16} />}
                {t('common.upload')}
              </Button>
            </div>

            {uploadResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm"
              >
                <Check size={16} />
                {uploadResult}
              </motion.div>
            )}

            {uploadedLogFile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm"
              >
                <Badge variant={uploadedLogFile.status === 'failed' ? 'destructive' : 'success'}>
                  {t(`logs.fileStatus.${uploadedLogFile.status}`)}
                </Badge>
                <span className="text-muted-foreground">
                  {t('logs.fileStatus.events')}: {uploadedLogFile.eventCount}
                </span>
                <span className="text-muted-foreground">
                  {t('logs.fileStatus.errors')}: {uploadedLogFile.errorCount}
                </span>
                {uploadedLogFile.status === 'parsed' && uploadedLogFileId && (
                  <PageHeaderActionButton asChild className="ml-auto gap-2">
                    <Link href={`/logs/files/${uploadedLogFileId}`}>
                      <FileText size={14} />
                      {t('logs.viewDiagnosis')}
                    </Link>
                  </PageHeaderActionButton>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Search Filters */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.2 }}
      >
        <Card className="glass border-white/[0.08]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Search size={18} />
                {t('common.search')}
              </CardTitle>
              <PageHeaderActionButton
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <Filter size={16} />
                {showFilters ? t('logs.filters.hideFilters') : t('logs.filters.moreFilters')}
                <ChevronRight size={14} className={cn('transition-transform', showFilters && 'rotate-90')} />
              </PageHeaderActionButton>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.eventNameOptional')}</label>
                <Input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. SDK init start"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.keyword')}</label>
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. error / timeout"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.startTime')}</label>
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.endTime')}</label>
                <Input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.level')}</label>
                <select
                  className="w-full h-9 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="">{t('logs.level.all')}</option>
                  <option value="1">DEBUG</option>
                  <option value="2">INFO</option>
                  <option value="3">WARN</option>
                  <option value="4">ERROR</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('logs.limit')}</label>
                <Input
                  type="number"
                  min={1}
                  max={MAX_RESULTS_PER_PAGE}
                  value={limit}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber;
                    if (!Number.isFinite(n)) return;
                    setLimit(
                      Math.min(Math.max(Math.trunc(n), 1), MAX_RESULTS_PER_PAGE),
                    );
                  }}
                  className="h-9"
                />
              </div>
            </div>

            {/* Advanced filters */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-3 border-t border-border/50">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.logFileIdOptional')}</label>
                      <Input
                        value={logFileId}
                        onChange={(e) => setLogFileId(e.target.value)}
                        placeholder="UUID"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.sdkVersion')}</label>
                      <Input
                        value={sdkVersion}
                        onChange={(e) => setSdkVersion(e.target.value)}
                        placeholder="e.g. v3.5.1"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.appId')}</label>
                      <Input
                        value={appId}
                        onChange={(e) => setAppId(e.target.value)}
                        placeholder="e.g. com.example.app"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.filters.linkCode')}</label>
                      <Input
                        value={linkCode}
                        onChange={(e) => setLinkCode(e.target.value)}
                        placeholder="APP session ID"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.filters.requestId')}</label>
                      <Input
                        value={requestId}
                        onChange={(e) => setRequestId(e.target.value)}
                        placeholder="Command chain ID"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">stage</label>
                      <Input
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        placeholder="e.g. ble/http/mqtt"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">op</label>
                      <Input
                        value={op}
                        onChange={(e) => setOp(e.target.value)}
                        placeholder="e.g. connect/publish/ack"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">result</label>
                      <Input
                        value={flowResult}
                        onChange={(e) => setFlowResult(e.target.value)}
                        placeholder="e.g. fail/timeout"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.filters.deviceMac')}</label>
                      <Input
                        value={deviceMac}
                        onChange={(e) => setDeviceMac(e.target.value)}
                        placeholder="AA:BB:CC:DD:EE:FF"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">deviceSn</label>
                      <Input
                        value={deviceSn}
                        onChange={(e) => setDeviceSn(e.target.value)}
                        placeholder="SN12345678"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.filters.errorCode')}</label>
                      <Input
                        value={errorCode}
                        onChange={(e) => setErrorCode(e.target.value)}
                        placeholder="e.g. E001"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">reasonCode</label>
                      <Input
                        value={reasonCode}
                        onChange={(e) => setReasonCode(e.target.value)}
                        placeholder="e.g. LINK_LOSS"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.msgContains')}</label>
                      <Input
                        value={msgContains}
                        onChange={(e) => setMsgContains(e.target.value)}
                        placeholder={t('logs.msgContainsPlaceholder')}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('logs.levelGte')}</label>
                      <select
                        className="w-full h-9 px-3 rounded-md bg-background/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        value={levelGte}
                        onChange={(e) => setLevelGte(e.target.value)}
                      >
                        <option value="">{t('logs.level.all')}</option>
                        <option value="2">&gt;=2 (INFO+)</option>
                        <option value="3">&gt;=3 (WARN+)</option>
                        <option value="4">&gt;=4 (ERROR)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Checkbox
                        id="excludeNoisy"
                        checked={excludeNoisy}
                        onCheckedChange={(checked) => setExcludeNoisy(checked === true)}
                      />
	                      <label
	                        htmlFor="excludeNoisy"
	                        className="text-xs text-muted-foreground select-none"
	                      >
	                        {t('logs.excludeNoisy')}
	                      </label>
	                    </div>
	                  </div>
	                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="flex gap-1">
                <PageHeaderActionButton onClick={() => setPresetRange(1)} disabled={loading}>
                  {t('logs.preset.1h')}
                </PageHeaderActionButton>
                <PageHeaderActionButton onClick={() => setPresetRange(24)} disabled={loading}>
                  {t('logs.preset.24h')}
                </PageHeaderActionButton>
                <PageHeaderActionButton onClick={() => setPresetRange(24 * 7)} disabled={loading}>
                  {t('logs.preset.7d')}
                </PageHeaderActionButton>
              </div>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLevelGte('4');
                  window.setTimeout(() => void search(true), 0);
                }}
                disabled={!canSearch || loading}
                className="gap-2 text-red-400 border-red-400/30 hover:bg-red-400/10"
              >
                <AlertCircle size={14} />
                {t('logs.onlyErrors')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEventName('PARSER_ERROR');
                  window.setTimeout(() => void search(true), 0);
                }}
                disabled={!canSearch || loading}
              >
                {t('logs.onlyParserError')}
              </Button>
              <Button
                onClick={() => void search(true)}
                disabled={!canSearch || loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search size={16} />}
                {t('common.search')}
              </Button>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                <AlertCircle size={16} />
                {error}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Results Table */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.3 }}
      >
        <Card className="glass border-white/[0.08]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {loading ? t('common.loading') : t('common.items', { count: results.length })}
              </CardTitle>
              {nextCursor && (
                <PageHeaderActionButton
                  onClick={() => void search(false)}
                  disabled={loading}
                >
                  {t('common.loadMore')}
                </PageHeaderActionButton>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">{t('table.time')}</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">{t('table.event')}</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">{t('table.level')}</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">{t('table.sdk')}</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">{t('table.app')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        {loading ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('common.loading')}
                          </div>
                        ) : (
                          t('logs.empty')
                        )}
                      </td>
                    </tr>
                  ) : enableRowAnimations ? (
                    <AnimatePresence>
                      {results.map((e) => (
                        <motion.tr
                          key={e.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.12 }}
                          className="border-b border-border/30 hover:bg-primary/5 cursor-pointer transition-colors"
                          onClick={() => setSelectedEventId(e.id)}
                        >
                          <td className="p-3 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock size={14} />
                              {new Date(e.timestampMs).toLocaleString(localeTag)}
                            </div>
                          </td>
                          <td className="p-3 min-w-[260px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {e.eventName === 'PARSER_ERROR' && (
                                <Badge variant="destructive" className="text-xs">
                                  {t('logs.parserError')}
                                </Badge>
                              )}
                              <span className="font-medium">
                                {renderHighlighted(e.eventName, keyword)}
                              </span>
                            </div>
                            {(e.linkCode ||
                              e.requestId ||
                              e.deviceMac ||
                              e.deviceSn ||
                              e.errorCode ||
                              e.reasonCode) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {e.linkCode && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    LC:{e.linkCode}
                                  </Badge>
                                )}
                                {e.requestId && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    RID:{e.requestId}
                                  </Badge>
                                )}
                                {e.deviceMac && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    MAC:{e.deviceMac}
                                  </Badge>
                                )}
                                {e.deviceSn && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    SN:{e.deviceSn}
                                  </Badge>
                                )}
                                {e.errorCode && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    ERR:{e.errorCode}
                                  </Badge>
                                )}
                                {e.reasonCode && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    RC:{e.reasonCode}
                                  </Badge>
                                )}
                              </div>
                            )}
                            {e.msg && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {renderHighlighted(shortenText(e.msg, 140), keyword)}
                              </div>
                            )}
                          </td>
                          <td className="p-3">{getLevelBadge(e.level)}</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {e.sdkVersion ?? '-'}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {e.appId ?? '-'}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  ) : (
                    <>
                      {results.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-border/30 hover:bg-primary/5 cursor-pointer transition-colors"
                          onClick={() => setSelectedEventId(e.id)}
                        >
                          <td className="p-3 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock size={14} />
                              {new Date(e.timestampMs).toLocaleString(localeTag)}
                            </div>
                          </td>
                          <td className="p-3 min-w-[260px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {e.eventName === 'PARSER_ERROR' && (
                                <Badge variant="destructive" className="text-xs">
                                  {t('logs.parserError')}
                                </Badge>
                              )}
                              <span className="font-medium">
                                {renderHighlighted(e.eventName, keyword)}
                              </span>
                            </div>
                            {(e.linkCode ||
                              e.requestId ||
                              e.deviceMac ||
                              e.deviceSn ||
                              e.errorCode ||
                              e.reasonCode) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {e.linkCode && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    LC:{e.linkCode}
                                  </Badge>
                                )}
                                {e.requestId && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    RID:{e.requestId}
                                  </Badge>
                                )}
                                {e.deviceMac && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    MAC:{e.deviceMac}
                                  </Badge>
                                )}
                                {e.deviceSn && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    SN:{e.deviceSn}
                                  </Badge>
                                )}
                                {e.errorCode && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    ERR:{e.errorCode}
                                  </Badge>
                                )}
                                {e.reasonCode && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    RC:{e.reasonCode}
                                  </Badge>
                                )}
                              </div>
                            )}
                            {e.msg && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {renderHighlighted(shortenText(e.msg, 140), keyword)}
                              </div>
                            )}
                          </td>
                          <td className="p-3">{getLevelBadge(e.level)}</td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {e.sdkVersion ?? '-'}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {e.appId ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedEventId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setSelectedEventId(null)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-2xl flex-col border-l border-white/[0.08] glass"
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] p-4">
                <div>
                  <h2 className="font-semibold">{t('logs.detail.title')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {detail ? detail.eventName : selectedEventId}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedEventId(null)}>
                  <X size={20} />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {detailLoading && (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}
                {detailError && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    {detailError}
                  </div>
                )}
                {detail && (
                  <>
                    {/* Key-Value Grid */}
	                    <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
	                      <span className="text-muted-foreground">eventName</span>
	                      <span className="font-medium">{detail.eventName}</span>
	                      <span className="text-muted-foreground">msg</span>
	                      <span>{detail.msg ? renderHighlighted(detail.msg, keyword) : '-'}</span>
                      <span className="text-muted-foreground">timestamp</span>
                      <span>{new Date(detail.timestampMs).toLocaleString(localeTag)}</span>
                      <span className="text-muted-foreground">level</span>
                      <span>{getLevelBadge(detail.level)}</span>
                      <span className="text-muted-foreground">sdkVersion</span>
                      <span>{detail.sdkVersion ?? '-'}</span>
                      <span className="text-muted-foreground">appId</span>
                      <span>{detail.appId ?? '-'}</span>
                      <span className="text-muted-foreground">terminalInfo</span>
                      <span className="text-xs">{detail.terminalInfo ?? '-'}</span>
                      <span className="text-muted-foreground">thread</span>
                      <span className="text-xs">
                        {detail.threadName ?? '-'}
                        {detail.threadId !== null ? ` (#${detail.threadId})` : ''}
                        {detail.isMainThread === null ? '' : detail.isMainThread ? ' main' : ' bg'}
                      </span>
	                      <span className="text-muted-foreground">logFileId</span>
	                      <span className="font-mono text-xs truncate">{detail.logFileId}</span>
	                      <span className="text-muted-foreground">eventId</span>
	                      <span className="font-mono text-xs truncate">{detail.id}</span>
	                      <span className="text-muted-foreground">linkCode</span>
	                      <span className="font-mono text-xs truncate">{detail.linkCode ?? '-'}</span>
	                      <span className="text-muted-foreground">requestId</span>
	                      <span className="font-mono text-xs truncate">{detail.requestId ?? '-'}</span>
	                      <span className="text-muted-foreground">attemptId</span>
	                      <span className="font-mono text-xs truncate">{detail.attemptId ?? '-'}</span>
	                      <span className="text-muted-foreground">deviceMac</span>
	                      <span className="font-mono text-xs truncate">{detail.deviceMac ?? '-'}</span>
	                      <span className="text-muted-foreground">deviceSn</span>
	                      <span className="font-mono text-xs truncate">{detail.deviceSn ?? '-'}</span>
	                      <span className="text-muted-foreground">errorCode</span>
	                      <span className="font-mono text-xs truncate">{detail.errorCode ?? '-'}</span>
	                      <span className="text-muted-foreground">reasonCode</span>
	                      <span className="font-mono text-xs truncate">{detail.reasonCode ?? '-'}</span>
	                    </div>

	                    {/* Copy buttons */}
	                    <div className="flex items-center gap-2">
                      <PageHeaderActionButton onClick={() => void copyText(detail.id)} className="gap-2">
                        <Copy size={14} />
                        {t('logs.detail.copyEventId')}
                      </PageHeaderActionButton>
                      <PageHeaderActionButton onClick={() => void copyText(detail.logFileId)} className="gap-2">
                        <Copy size={14} />
                        {t('logs.detail.copyLogFileId')}
                      </PageHeaderActionButton>
                      {copyHint && (
                        <span className="text-sm text-emerald-400 flex items-center gap-1">
                          <Check size={14} />
                          {copyHint}
                        </span>
	                      )}
	                    </div>

	                    {/* Quick jump */}
	                    <div className="flex flex-wrap items-center gap-2">
		                      {detail.linkCode && projectId && (
                          <PageHeaderActionButton asChild>
                            <Link
                              href={`/logs/trace?${new URLSearchParams({
                                projectId,
                                ...(logFileId.trim() ? { logFileId: logFileId.trim() } : {}),
                                type: 'linkCode',
                                value: detail.linkCode,
                                auto: '1',
                              }).toString()}`}
                            >
                              {t('logs.detail.traceLinkCode')}
                            </Link>
                          </PageHeaderActionButton>
                      )}
                      {detail.requestId && projectId && (
                        <PageHeaderActionButton asChild>
                          <Link
                            href={`/logs/trace?${new URLSearchParams({
                              projectId,
                              ...(logFileId.trim() ? { logFileId: logFileId.trim() } : {}),
                              type: 'requestId',
                              value: detail.requestId,
                              auto: '1',
                            }).toString()}`}
                          >
                            {t('logs.detail.traceRequestId')}
                          </Link>
                        </PageHeaderActionButton>
                      )}
                      {detail.attemptId && projectId && (
                        <PageHeaderActionButton asChild>
                          <Link
                            href={`/logs/trace?${new URLSearchParams({
                              projectId,
                              ...(logFileId.trim() ? { logFileId: logFileId.trim() } : {}),
                              type: 'attemptId',
                              value: detail.attemptId,
                              auto: '1',
                            }).toString()}`}
                          >
                            {t('logs.detail.traceAttemptId')}
                          </Link>
                        </PageHeaderActionButton>
                      )}
                      {detail.deviceMac && projectId && (
                        <>
                          <PageHeaderActionButton asChild>
                            <Link
                              href={`/logs/trace?${new URLSearchParams({
                                projectId,
                                ...(logFileId.trim() ? { logFileId: logFileId.trim() } : {}),
		                                type: 'deviceMac',
		                                value: detail.deviceMac,
		                                startTime: new Date(detail.timestampMs - 2 * 60 * 60 * 1000).toISOString(),
                                endTime: new Date(detail.timestampMs + 2 * 60 * 60 * 1000).toISOString(),
                                auto: '1',
                              }).toString()}`}
                            >
                              {t('logs.detail.traceDeviceMac')}
                            </Link>
                          </PageHeaderActionButton>
                          <PageHeaderActionButton asChild>
                            <Link
                              href={`/logs/commands?${new URLSearchParams({
                                projectId,
                                ...(logFileId.trim() ? { logFileId: logFileId.trim() } : {}),
		                                deviceMac: detail.deviceMac,
		                                startTime: new Date(detail.timestampMs - 2 * 60 * 60 * 1000).toISOString(),
		                                endTime: new Date(detail.timestampMs + 2 * 60 * 60 * 1000).toISOString(),
                                limit: '100',
                                auto: '1',
                              }).toString()}`}
                            >
                              {t('logs.detail.openCommands')}
                            </Link>
                          </PageHeaderActionButton>
                        </>
                      )}
                      {detail.deviceSn && projectId && (
                        <PageHeaderActionButton asChild>
                          <Link
                            href={`/logs/trace?${new URLSearchParams({
                              projectId,
                              ...(logFileId.trim() ? { logFileId: logFileId.trim() } : {}),
		                              type: 'deviceSn',
		                              value: detail.deviceSn,
		                              startTime: new Date(detail.timestampMs - 2 * 60 * 60 * 1000).toISOString(),
                              endTime: new Date(detail.timestampMs + 2 * 60 * 60 * 1000).toISOString(),
                              auto: '1',
                            }).toString()}`}
                          >
                            {t('logs.detail.traceDeviceSn')}
                          </Link>
                        </PageHeaderActionButton>
                      )}
	                    </div>

	                    {/* Context */}
	                    <div className="space-y-2">
	                      <h3 className="text-sm font-medium">{t('logs.detail.context')}</h3>
                      {contextLoading && <Skeleton className="h-20 w-full" />}
                      {contextError && <div className="text-sm text-destructive">{contextError}</div>}
                      {context && (
                        <div className="border border-border/50 rounded-lg overflow-hidden">
                          {context.before.map((e) => (
                            <div
                              key={e.id}
                              className="p-2 border-b border-border/30 hover:bg-primary/5 cursor-pointer text-sm"
                              onClick={() => setSelectedEventId(e.id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(e.timestampMs).toLocaleString(localeTag)}
                                </span>
                                {getLevelBadge(e.level)}
                              </div>
                              <div className="font-medium">{renderHighlighted(e.eventName, keyword)}</div>
                              {e.msg && (
                                <div className="text-xs text-muted-foreground">
                                  {renderHighlighted(shortenText(e.msg, 100), keyword)}
                                </div>
                              )}
                            </div>
                          ))}
                          <div className="p-2 bg-primary/10 text-center text-sm text-primary font-medium">
                            {t('logs.detail.current')}
                          </div>
                          {context.after.map((e) => (
                            <div
                              key={e.id}
                              className="p-2 border-t border-border/30 hover:bg-primary/5 cursor-pointer text-sm"
                              onClick={() => setSelectedEventId(e.id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(e.timestampMs).toLocaleString(localeTag)}
                                </span>
                                {getLevelBadge(e.level)}
                              </div>
                              <div className="font-medium">{renderHighlighted(e.eventName, keyword)}</div>
                              {e.msg && (
                                <div className="text-xs text-muted-foreground">
                                  {renderHighlighted(shortenText(e.msg, 100), keyword)}
                                </div>
                              )}
                            </div>
                          ))}
                          {context.before.length === 0 && context.after.length === 0 && (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                              {t('logs.detail.contextEmpty')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* msgJson */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">{t('logs.detail.msgJson')}</h3>
                      <pre className="p-3 rounded-lg bg-background/50 border border-border/50 text-xs overflow-x-auto">
                        {renderHighlighted(prettyJson(detail.msgJson), keyword)}
                      </pre>
                    </div>

                    {/* rawLine */}
                    {detail.rawLine && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium">{t('logs.detail.rawLine')}</h3>
                        <pre className="p-3 rounded-lg bg-background/50 border border-border/50 text-xs overflow-x-auto">
                          {renderHighlighted(detail.rawLine, keyword)}
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
