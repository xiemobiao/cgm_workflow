import { StageName } from '@prisma/client';
import { z } from 'zod';

export const stageNameSchema = z.nativeEnum(StageName);

export const integrationMappingSchema = z.object({
  fieldMap: z.object({
    external_id: z.string().min(1),
    title: z.string().min(1),
    status: z.string().min(1),
    type: z.string().nullable().optional(),
    priority: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
    tags: z.string().nullable().optional(),
  }),
  statusMap: z
    .record(z.string().min(1), stageNameSchema)
    .refine((m) => Object.keys(m).length > 0, {
      message: 'statusMap must contain at least 1 entry',
    }),
  filters: z.object({
    typeContains: z.string().min(1),
    tagContains: z.string().nullable().optional(),
  }),
});

export type IntegrationMapping = z.infer<typeof integrationMappingSchema>;
