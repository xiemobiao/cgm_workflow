'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { clearToken, getToken } from '@/lib/auth';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import styles from './AppShell.module.css';

const PUBLIC_PATHS = new Set(['/login', '/health']);

export function AppShell(props: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AppShellInner>{props.children}</AppShellInner>
    </I18nProvider>
  );
}

function AppShellInner(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const { t } = useI18n();

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (isPublic) {
        setReady(true);
        return;
      }

      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [isPublic, router]);

  const showNav = !isPublic;

  return (
    <div className={styles.shell}>
      {showNav ? (
        <header className={styles.topbar}>
          <div className={styles.brand}>CGM Workflow</div>
          <nav className={styles.nav}>
            <Link href="/" data-active={pathname === '/'}>
              {t('nav.dashboard')}
            </Link>
            <Link href="/requirements" data-active={pathname === '/requirements'}>
              {t('nav.requirements')}
            </Link>
            <Link href="/workflows" data-active={pathname?.startsWith('/workflows')}>
              {t('nav.workflows')}
            </Link>
            <Link href="/logs" data-active={pathname === '/logs'}>
              {t('nav.logs')}
            </Link>
            <Link href="/incidents" data-active={pathname === '/incidents'}>
              {t('nav.incidents')}
            </Link>
            <Link href="/integrations" data-active={pathname === '/integrations'}>
              {t('nav.integrations')}
            </Link>
            <Link href="/settings" data-active={pathname === '/settings'}>
              {t('nav.settings')}
            </Link>
          </nav>
          <div className={styles.actions}>
            <LanguageSwitch />
            <button
              className={styles.button}
              type="button"
              onClick={() => {
                clearToken();
                router.replace('/login');
              }}
            >
              {t('nav.logout')}
            </button>
          </div>
        </header>
      ) : null}

      <main className={styles.content}>
        <div key={pathname} className={styles.pageEnter}>
          {!ready ? (
            <div className={`${styles.card} ${styles.loadingCard}`}>{t('common.loading')}</div>
          ) : (
            props.children
          )}
        </div>
      </main>
    </div>
  );
}
