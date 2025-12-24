'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  AlertTriangle,
  HelpCircle,
  FileBarChart,
  Settings,
  ChevronRight,
  Activity,
  Folder,
  CheckCircle2,
} from 'lucide-react';
import { ApiClientError, apiFetch } from '@/lib/api';
import { getProjectId, setProjectId } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { staggerContainer, staggerItem, fadeIn } from '@/lib/animations';
import { cn } from '@/lib/utils';

type Project = {
  id: string;
  name: string;
  type: string;
  status: string;
  role: string;
};

const QUICK_LINKS = [
  {
    href: '/logs',
    labelKey: 'nav.logs',
    descKey: 'logs.uploadHint',
    icon: FileText,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    href: '/incidents',
    labelKey: 'nav.incidents',
    descKey: 'incidents.empty',
    icon: AlertTriangle,
    color: 'from-orange-500 to-amber-500',
    bgColor: 'bg-orange-500/10',
  },
  {
    href: '/known-issues',
    labelKey: 'nav.knownIssues',
    descKey: 'knownIssues.desc',
    icon: HelpCircle,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    href: '/reports',
    labelKey: 'nav.reports',
    descKey: 'reports.desc',
    icon: FileBarChart,
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-500/10',
  },
];

export default function DashboardPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProjectIdState(getProjectId() ?? '');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Project[]>('/api/projects')
      .then((rows) => {
        if (cancelled) return;
        setError('');
        setProjects(rows);
        setProjectIdState((current) => {
          if (current) return current;
          const first = rows[0]?.id;
          if (!first) return current;
          setProjectId(first);
          return first;
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiClientError ? `${e.code}: ${e.message}` : String(e);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="flex flex-col gap-2"
      >
        <h1 className="text-3xl font-bold gradient-text">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">
          CGM SDK Debug Platform - {t('dashboard.corePages')}
        </p>
      </motion.div>

      {/* Project Selector Card */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
                <Folder className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">{t('project.current')}</CardTitle>
                <CardDescription>{t('project.label')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : (
              <div className="space-y-4">
                <select
                  className={cn(
                    'w-full h-11 px-4 rounded-lg',
                    'bg-background/50 border border-border/50',
                    'text-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    'transition-all duration-200'
                  )}
                  value={projectId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setProjectId(next);
                    setProjectIdState(next);
                  }}
                >
                  <option value="" disabled>
                    {t('project.selectPlaceholder')}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>

                {current ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10"
                  >
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{current.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {current.id}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary">{current.type}</Badge>
                      <Badge variant="success">{current.status}</Badge>
                    </div>
                  </motion.div>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
                    {t('dashboard.needProjectHint')}
                  </div>
                )}

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-destructive p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                  >
                    {error}
                  </motion.div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Links Grid */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {QUICK_LINKS.map((link, index) => {
          const Icon = link.icon;
          return (
            <motion.div key={link.href} variants={staggerItem} custom={index}>
              <Link href={link.href} className="block group">
                <Card className="glass border-border/50 h-full transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                          'bg-gradient-to-br',
                          link.color,
                          'shadow-lg',
                          `shadow-${link.color.split('-')[1]}/25`
                        )}
                      >
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {t(link.labelKey)}
                          </h3>
                          <ChevronRight
                            size={16}
                            className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {t(link.descKey)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Settings & Info */}
      <motion.div
        variants={fadeIn}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <Link href="/settings" className="block group">
          <Card className="glass border-border/50 transition-all duration-300 hover:border-primary/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {t('nav.settings')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.projects.desc')}
                  </p>
                </div>
                <ChevronRight
                  size={20}
                  className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all"
                />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="glass border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  {t('dashboard.adminHint', {
                    email: 'admin@local.dev',
                    password: '******',
                  })}
                </h3>
                <p className="text-sm text-muted-foreground font-mono">
                  admin@local.dev
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
