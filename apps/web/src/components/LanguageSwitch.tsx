'use client';

import { useI18n } from '@/lib/i18n';
import styles from './LanguageSwitch.module.css';

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();

  return (
    <div className={styles.switch} data-locale={locale} aria-label="Language switch">
      <button
        type="button"
        className={styles.btn}
        data-active={locale === 'zh'}
        onClick={() => setLocale('zh')}
      >
        中文
      </button>
      <button
        type="button"
        className={styles.btn}
        data-active={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
    </div>
  );
}

