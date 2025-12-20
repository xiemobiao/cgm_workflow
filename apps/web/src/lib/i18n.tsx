'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'cgm_locale';

const MESSAGES: Record<Locale, Record<string, string>> = {
  zh: {
    'nav.dashboard': '仪表盘',
    'nav.requirements': '需求',
    'nav.workflows': '工作流',
    'nav.logs': '日志',
    'nav.incidents': '事故',
    'nav.integrations': '集成',
    'nav.settings': '设置',
    'nav.logout': '退出',

    'common.loading': '加载中…',
    'common.refresh': '刷新',
    'common.back': '返回',
    'common.create': '创建',
    'common.search': '搜索',
    'common.upload': '上传',
    'common.loadMore': '加载更多',
    'common.items': '共 {count} 条',
    'common.none': '无',
    'common.yes': '是',
    'common.no': '否',

    'table.time': '时间',
    'table.event': '事件',
    'table.level': '级别',
    'table.sdk': 'SDK',
    'table.app': '应用',
    'table.id': 'ID',
    'table.externalId': '外部 ID',
    'table.title': '标题',
    'table.status': '状态',
    'table.sourceStatus': '来源状态',
    'table.workflow': '工作流',
    'table.stage': '阶段',
    'table.updated': '更新时间',
    'table.logEvents': '日志事件数',
    'table.actions': '操作',

    'project.label': '项目',
    'project.current': '当前项目',
    'project.selectPlaceholder': '请选择项目…',

    'dashboard.title': '仪表盘',
    'dashboard.needProjectHint': '需要先登录并在数据库中有可访问的项目。',
    'dashboard.corePages': '核心页面',
    'dashboard.integrationsAndSettings': '集成与配置',
    'dashboard.adminHint': '默认管理员账号：{email} / {password}（seed 可改）',

    'login.title': '登录',
    'login.desc': '使用 API 的 JWT 登录，token 会保存在浏览器 localStorage。',
    'login.email': '邮箱',
    'login.password': '密码',
    'login.submit': '登录',
    'login.submitting': '登录中…',

    'requirements.title': '需求',
    'requirements.syncIntegrationId': '同步 integrationId（可选）',
    'requirements.sync': '同步',
    'requirements.empty': '暂无数据（需要先在后端 sync requirements 或写入数据）。',

    'workflows.title': '工作流',
    'workflows.empty': '暂无数据（需要先创建 workflow 或通过 requirements sync 自动创建）。',
    'workflow.detail.title': '工作流详情',
    'workflow.stages': '阶段',
    'workflow.stageStatus': '阶段状态',
    'workflow.gate': '闸门',
    'workflow.reason': '原因（override 必填）',
    'workflow.approve': '批准',
    'workflow.override': '强制通过',
    'workflow.noData': '暂无数据',

    'logs.title': '日志',
    'logs.uploadTitle': '上传解码后的 JSONL',
    'logs.uploadHint': '需要上传“解码后的 JSONL”，每行是一个 outer JSON（含字段 c/f/l/...）。',
    'logs.eventNameOptional': 'eventName（可选）',
    'logs.startTime': '开始时间',
    'logs.endTime': '结束时间',
    'logs.preset.1h': '近 1 小时',
    'logs.preset.24h': '近 24 小时',
    'logs.preset.7d': '近 7 天',
    'logs.invalidTimeRange': '结束时间需要晚于开始时间',
    'logs.timeRangeRequired': '请先选择开始时间与结束时间',
    'logs.empty':
      '暂无数据。请先扩大时间范围或稍等解析完成；如怀疑解析失败，可搜索 eventName=PARSER_ERROR。',

    'incidents.title': '事故',
    'incidents.titleLabel': '标题',
    'incidents.severity': '严重级别',
    'incidents.status': '状态',
    'incidents.startTime': '开始时间（ISO8601）',
    'incidents.endTime': '结束时间（可选，ISO8601 或留空）',
    'incidents.logEventIds': 'logEventIds（可选，逗号分隔）',
    'incidents.markResolved': '标记已解决',
    'incidents.empty': '暂无数据（需要 Support/Admin 权限）。',

    'severity.low': '低',
    'severity.medium': '中',
    'severity.high': '高',
    'severity.critical': '致命',

    'incidentStatus.open': '开启',
    'incidentStatus.investigating': '排查中',
    'incidentStatus.resolved': '已解决',
    'incidentStatus.closed': '已关闭',

    'integrations.title': '集成',
    'integrations.createEnable': '创建 / 启用',
    'integrations.load': '加载',
    'integrations.mappingJson': 'Mapping JSON',
    'integrations.saveMapping': '保存 mapping',
    'integrations.integrationJson': 'Integration JSON（GET /api/integrations/:id）',

    'settings.title': '设置',
    'settings.apiBaseUrl': 'API Base URL',
    'settings.token': 'Token',
    'settings.tokenPresent': '已存在（{count} 字符）',
    'settings.tokenMissing': '缺失',
    'settings.selectedProjectId': '已选择的 projectId',
    'settings.clearProjectSelection': '清除项目选择',
    'settings.refreshPage': '刷新页面',
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.requirements': 'Requirements',
    'nav.workflows': 'Workflows',
    'nav.logs': 'Logs',
    'nav.incidents': 'Incidents',
    'nav.integrations': 'Integrations',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',

    'common.loading': 'Loading…',
    'common.refresh': 'Refresh',
    'common.back': 'Back',
    'common.create': 'Create',
    'common.search': 'Search',
    'common.upload': 'Upload',
    'common.loadMore': 'Load more',
    'common.items': '{count} items',
    'common.none': 'None',
    'common.yes': 'Yes',
    'common.no': 'No',

    'table.time': 'Time',
    'table.event': 'Event',
    'table.level': 'Level',
    'table.sdk': 'SDK',
    'table.app': 'App',
    'table.id': 'ID',
    'table.externalId': 'External ID',
    'table.title': 'Title',
    'table.status': 'Status',
    'table.sourceStatus': 'Source status',
    'table.workflow': 'Workflow',
    'table.stage': 'Stage',
    'table.updated': 'Updated',
    'table.logEvents': 'Log events',
    'table.actions': 'Actions',

    'project.label': 'Project',
    'project.current': 'Current project',
    'project.selectPlaceholder': 'Select a project…',

    'dashboard.title': 'Dashboard',
    'dashboard.needProjectHint':
      'Please log in and make sure there is at least one accessible project in the database.',
    'dashboard.corePages': 'Core pages',
    'dashboard.integrationsAndSettings': 'Integrations & settings',
    'dashboard.adminHint': 'Default admin: {email} / {password} (seed can override)',

    'login.title': 'Login',
    'login.desc': 'Sign in with API JWT. The token is stored in browser localStorage.',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Login',
    'login.submitting': 'Logging in…',

    'requirements.title': 'Requirements',
    'requirements.syncIntegrationId': 'Sync integrationId (optional)',
    'requirements.sync': 'Sync',
    'requirements.empty': 'No data. Run requirements sync (or insert data) on the backend first.',

    'workflows.title': 'Workflows',
    'workflows.empty':
      'No data. Create a workflow manually, or let requirements sync create it automatically.',
    'workflow.detail.title': 'Workflow detail',
    'workflow.stages': 'Stages',
    'workflow.stageStatus': 'Stage status',
    'workflow.gate': 'Gate',
    'workflow.reason': 'Reason (required for override)',
    'workflow.approve': 'Approve',
    'workflow.override': 'Override',
    'workflow.noData': 'No data',

    'logs.title': 'Logs',
    'logs.uploadTitle': 'Upload decoded JSONL',
    'logs.uploadHint':
      'Upload decoded JSONL. Each line is an outer JSON entry (with c/f/l/...).',
    'logs.eventNameOptional': 'eventName (optional)',
    'logs.startTime': 'Start time',
    'logs.endTime': 'End time',
    'logs.preset.1h': 'Last 1h',
    'logs.preset.24h': 'Last 24h',
    'logs.preset.7d': 'Last 7d',
    'logs.invalidTimeRange': 'End time must be later than start time',
    'logs.timeRangeRequired': 'Please select start and end time first',
    'logs.empty':
      'No data. Expand the time range or wait for parsing; failures show as eventName=PARSER_ERROR.',

    'incidents.title': 'Incidents',
    'incidents.titleLabel': 'Title',
    'incidents.severity': 'Severity',
    'incidents.status': 'Status',
    'incidents.startTime': 'startTime (ISO8601)',
    'incidents.endTime': 'endTime (optional, ISO8601 or blank)',
    'incidents.logEventIds': 'logEventIds (optional, comma-separated)',
    'incidents.markResolved': 'Mark resolved',
    'incidents.empty': 'No data (requires Support/Admin permission).',

    'severity.low': 'low',
    'severity.medium': 'medium',
    'severity.high': 'high',
    'severity.critical': 'critical',

    'incidentStatus.open': 'open',
    'incidentStatus.investigating': 'investigating',
    'incidentStatus.resolved': 'resolved',
    'incidentStatus.closed': 'closed',

    'integrations.title': 'Integrations',
    'integrations.createEnable': 'Create / Enable',
    'integrations.load': 'Load',
    'integrations.mappingJson': 'Mapping JSON',
    'integrations.saveMapping': 'Save mapping',
    'integrations.integrationJson': 'Integration JSON (GET /api/integrations/:id)',

    'settings.title': 'Settings',
    'settings.apiBaseUrl': 'API Base URL',
    'settings.token': 'Token',
    'settings.tokenPresent': 'Present ({count} chars)',
    'settings.tokenMissing': 'Missing',
    'settings.selectedProjectId': 'Selected projectId',
    'settings.clearProjectSelection': 'Clear project selection',
    'settings.refreshPage': 'Refresh page',
  },
};

function interpolate(template: string, vars: Record<string, string | number> | undefined) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  );
}

function translate(locale: Locale, key: string, vars?: Record<string, string | number>) {
  const msg = MESSAGES[locale][key] ?? MESSAGES.zh[key] ?? key;
  return interpolate(msg, vars);
}

type I18nContextValue = {
  locale: Locale;
  localeTag: 'zh-CN' | 'en-US';
  setLocale: (next: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') setLocaleState(saved);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const localeTag = locale === 'zh' ? 'zh-CN' : 'en-US';

  useEffect(() => {
    document.documentElement.lang = localeTag;
  }, [localeTag]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localeTag,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, localeTag, setLocale],
  );

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
