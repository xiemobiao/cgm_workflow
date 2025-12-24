'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock, AlertCircle, Loader2, Zap } from 'lucide-react';
import { ApiClientError, apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fadeIn, slideInFromBottom, scaleIn } from '@/lib/animations';

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

  const handleSubmit = async (e: React.FormEvent) => {
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
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.5, 0.3, 0.5],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      <motion.div
        variants={scaleIn}
        initial="initial"
        animate="animate"
        className="w-full max-w-md relative z-10"
      >
        <Card className="glass border-border/50 backdrop-blur-xl">
          <CardHeader className="space-y-4 pb-6">
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              className="flex justify-center"
            >
              <div className="relative">
                <motion.div
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/25"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Zap className="w-8 h-8 text-white" />
                </motion.div>
                <motion.div
                  className="absolute -inset-2 bg-primary/20 rounded-2xl blur-xl"
                  animate={{
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </div>
            </motion.div>
            <div className="text-center space-y-2">
              <CardTitle className="text-2xl font-bold gradient-text">
                CGM SDK Debug
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('login.desc')}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <motion.div
                variants={slideInFromBottom}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 }}
                className="space-y-2"
              >
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Mail size={14} className="text-muted-foreground" />
                  {t('login.email')}
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@local.dev"
                  autoComplete="email"
                  className="h-11"
                />
              </motion.div>

              <motion.div
                variants={slideInFromBottom}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.2 }}
                className="space-y-2"
              >
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Lock size={14} className="text-muted-foreground" />
                  {t('login.password')}
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                  className="h-11"
                />
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </motion.div>
              )}

              <motion.div
                variants={slideInFromBottom}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.3 }}
                className="pt-2"
              >
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 font-medium"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('login.submitting')}
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      {t('login.submit')}
                    </>
                  )}
                </Button>
              </motion.div>
            </form>
          </CardContent>
        </Card>

        {/* Footer hint */}
        <motion.p
          variants={fadeIn}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-muted-foreground mt-6"
        >
          {t('dashboard.adminHint', { email: 'admin@local.dev', password: 'admin123456' })}
        </motion.p>
      </motion.div>
    </div>
  );
}
