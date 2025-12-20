'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import shellStyles from '@/components/AppShell.module.css';
import formStyles from '@/components/Form.module.css';
import { ApiClientError, apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type LoginResponse = {
  token: string;
  user: { id: string; name: string; email: string; role: string };
};

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('admin@local.dev');
  const [password, setPassword] = useState('admin123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className={shellStyles.grid}>
      <div className={shellStyles.card}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{t('login.title')}</h1>
        <div className={formStyles.muted} style={{ marginBottom: 10 }}>
          {t('login.desc')}
        </div>

        <form
          className={shellStyles.grid}
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setLoading(true);
            try {
              const data = await apiFetch<LoginResponse>('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                skipAuth: true,
              });
              setToken(data.token);
              router.replace('/');
            } catch (err: unknown) {
              const msg =
                err instanceof ApiClientError
                  ? `${err.code}: ${err.message}`
                  : String(err);
              setError(msg);
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('login.email')}</div>
            <input
              className={formStyles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@local.dev"
              autoComplete="email"
            />
          </div>
          <div className={formStyles.field}>
            <div className={formStyles.label}>{t('login.password')}</div>
            <input
              className={formStyles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="admin123456"
              autoComplete="current-password"
            />
          </div>

          {error ? <div className={formStyles.error}>{error}</div> : null}

          <div className={formStyles.row}>
            <button
              className={shellStyles.button}
              type="submit"
              disabled={loading}
            >
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
