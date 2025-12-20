import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    API_PORT: z.coerce.number().int().positive().default(3001),
    WEB_BASE_URL: z.string().url().default('http://localhost:3000'),

    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),

    STORAGE_DRIVER: z.enum(['minio', 'local']).default('local'),
    MINIO_ENDPOINT: z.string().url().optional(),
    MINIO_ACCESS_KEY: z.string().optional(),
    MINIO_SECRET_KEY: z.string().optional(),
    MINIO_BUCKET: z.string().optional(),

    JWT_SECRET: z.string().min(1).optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    const isTest = val.NODE_ENV === 'test';
    if (!isTest && !val.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when NODE_ENV is not test',
      });
    }

    if (!isTest && !val.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET is required when NODE_ENV is not test',
      });
    }

    if (val.STORAGE_DRIVER !== 'minio') return;

    const required = [
      'MINIO_ENDPOINT',
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY',
      'MINIO_BUCKET',
    ] as const;

    for (const key of required) {
      if (!val[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=minio`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;
