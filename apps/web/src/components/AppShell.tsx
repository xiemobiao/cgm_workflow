'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  HelpCircle,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Search,
  GitBranch,
  BarChart3,
} from 'lucide-react';
import { clearToken, getToken } from '@/lib/auth';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import styles from './AppShell.module.css';

const PUBLIC_PATHS = new Set(['/login', '/health']);

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  children?: { href: string; labelKey: string; icon: React.ReactNode }[];
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={20} /> },
  {
    href: '/logs',
    labelKey: 'nav.logs',
    icon: <FileText size={20} />,
    children: [
      { href: '/logs', labelKey: 'logs.title', icon: <Search size={18} /> },
      { href: '/logs/files', labelKey: 'logs.files.title', icon: <FileText size={18} /> },
      { href: '/logs/trace', labelKey: 'logs.trace', icon: <GitBranch size={18} /> },
      { href: '/logs/commands', labelKey: 'logs.commands', icon: <BarChart3 size={18} /> },
    ],
  },
  { href: '/incidents', labelKey: 'nav.incidents', icon: <AlertTriangle size={20} /> },
  { href: '/known-issues', labelKey: 'nav.knownIssues', icon: <HelpCircle size={20} /> },
  { href: '/reports', labelKey: 'nav.reports', icon: <FileBarChart size={20} /> },
  { href: '/settings', labelKey: 'nav.settings', icon: <Settings size={20} /> },
];

export function AppShell(props: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <TooltipProvider delayDuration={100}>
        <AppShellInner>{props.children}</AppShellInner>
      </TooltipProvider>
    </I18nProvider>
  );
}

function AppShellInner(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuState, setMobileMenuState] = useState<{ pathname: string; open: boolean }>({
    pathname,
    open: false,
  });
  const mobileMenuOpen = mobileMenuState.pathname === pathname ? mobileMenuState.open : false;
  const setMobileMenuOpen = (open: boolean) => setMobileMenuState({ pathname, open });
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const { t } = useI18n();

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);
  const expandedItemForRender = pathname?.startsWith('/logs') ? '/logs' : expandedItem;

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

  const handleLogout = () => {
    clearToken();
    router.replace('/login');
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-transparent text-foreground relative z-[1]">
      {showNav && (
        <>
          {/* Mobile Header */}
          <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 glass border-b border-border/50 flex items-center justify-between px-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 hover:bg-accent/10 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <span className="font-bold text-lg gradient-text">CGM SDK Debug</span>
            <LanguageSwitch />
          </header>

          {/* Mobile Menu Overlay */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <motion.aside
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="fixed left-0 top-0 bottom-0 w-72 glass border-r border-border/50 z-50 lg:hidden flex flex-col"
                >
                  <div className="h-14 flex items-center justify-between px-4 border-b border-border/50">
                    <span className="font-bold text-lg gradient-text">CGM SDK Debug</span>
                    <button
                      onClick={() => setMobileMenuOpen(false)}
                      className="p-2 hover:bg-accent/10 rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <nav className="flex-1 overflow-y-auto p-3">
	                    <NavContent
	                      items={NAV_ITEMS}
	                      t={t}
	                      isActive={isActive}
	                      collapsed={false}
	                      expandedItem={expandedItemForRender}
	                      setExpandedItem={setExpandedItem}
	                    />
                  </nav>
                  <div className="p-3 border-t border-border/50">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleLogout}
                    >
                      <LogOut size={20} />
                      {t('nav.logout')}
                    </Button>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          {/* Desktop Sidebar */}
          <motion.aside
            initial={false}
            animate={{ width: sidebarCollapsed ? 72 : 240 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="hidden lg:flex fixed left-0 top-0 bottom-0 flex-col glass border-r border-border/50 z-40"
          >
            {/* Logo */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-border/50">
              <AnimatePresence mode="wait">
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="font-bold text-lg gradient-text whitespace-nowrap"
                  >
                    CGM SDK Debug
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 hover:bg-accent/10 rounded-lg transition-colors"
              >
                <motion.div
                  animate={{ rotate: sidebarCollapsed ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronLeft size={20} />
                </motion.div>
              </button>
            </div>

            {/* Nav Items */}
            <nav className="flex-1 overflow-y-auto p-3">
	              <NavContent
	                items={NAV_ITEMS}
	                t={t}
	                isActive={isActive}
	                collapsed={sidebarCollapsed}
	                expandedItem={expandedItemForRender}
	                setExpandedItem={setExpandedItem}
	              />
            </nav>

            {/* Footer */}
            <div className="p-3 border-t border-border/50 space-y-2">
              <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between px-2')}>
                {!sidebarCollapsed && <span className="text-xs text-muted-foreground">Language</span>}
                <LanguageSwitch />
              </div>
              <Separator className="my-2" />
              {sidebarCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleLogout}
                    >
                      <LogOut size={20} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t('nav.logout')}</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                >
                  <LogOut size={20} />
                  {t('nav.logout')}
                </Button>
              )}
            </div>
          </motion.aside>
        </>
      )}

      {/* Main Content */}
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          showNav && 'lg:pl-[240px]',
          showNav && sidebarCollapsed && 'lg:pl-[72px]',
          showNav && 'pt-14 lg:pt-0'
        )}
      >
        <div className="max-w-[1920px] mx-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {!ready ? (
                <div className={cn(styles.card, styles.loadingCard, 'p-8')}>
                  {t('common.loading')}
                </div>
              ) : (
                props.children
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavContent({
  items,
  t,
  isActive,
  collapsed,
  expandedItem,
  setExpandedItem,
}: {
  items: NavItem[];
  t: (key: string) => string;
  isActive: (href: string) => boolean;
  collapsed: boolean;
  expandedItem: string | null;
  setExpandedItem: (item: string | null) => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.href}>
          {item.children ? (
            <div>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center justify-center p-3 rounded-lg transition-all duration-200',
                        isActive(item.href)
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'hover:bg-accent/10 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {item.icon}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="flex flex-col gap-1">
                    <span className="font-medium">{t(item.labelKey)}</span>
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t(child.labelKey)}
                      </Link>
                    ))}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <button
                    onClick={() => setExpandedItem(expandedItem === item.href ? null : item.href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                      isActive(item.href)
                        ? 'bg-primary/20 text-primary'
                        : 'hover:bg-accent/10 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {item.icon}
                    <span className="flex-1 text-left text-sm font-medium">{t(item.labelKey)}</span>
                    <motion.div
                      animate={{ rotate: expandedItem === item.href ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronLeft size={16} className="rotate-180" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {expandedItem === item.href && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden ml-4 mt-1 space-y-1 border-l border-border/50 pl-3"
                      >
                        {item.children.map((child) => (
                          <motion.li
                            key={child.href}
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Link
                              href={child.href}
                              className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                                isActive(child.href) && child.href !== '/logs'
                                  ? 'bg-primary/15 text-primary'
                                  : child.href === '/logs' && location.pathname === '/logs'
                                  ? 'bg-primary/15 text-primary'
                                  : 'hover:bg-accent/10 text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {child.icon}
                              {t(child.labelKey)}
                            </Link>
                          </motion.li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          ) : collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center justify-center p-3 rounded-lg transition-all duration-200',
                    isActive(item.href)
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'hover:bg-accent/10 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item.icon}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                isActive(item.href)
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-accent/10 text-muted-foreground hover:text-foreground'
              )}
            >
              {item.icon}
              <span className="text-sm font-medium">{t(item.labelKey)}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
