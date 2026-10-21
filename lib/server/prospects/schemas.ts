import { z } from 'zod';

export const searchParamsSchema = z.object({
  strategy: z.enum(['explicite', 'signal', 'marche']),
  zones: z.array(z.string().trim().min(1).max(80)).max(10).default(['Oise']),
  sectors: z.array(z.string().max(40)).max(20).default([]),
  needs: z.array(z.string().max(40)).max(12).default([]),
  customQuery: z.string().trim().max(250).default(''),
  freshness: z.enum(['pd', 'pw', 'pm', 'py', 'all']).default('pm'),
  maxQueries: z.number().int().min(1).max(20).default(6),
  pages: z.number().int().min(1).max(2).default(1),
});

export const profileSchema = searchParamsSchema.extend({
  name: z.string().trim().min(1).max(120),
  schedule_enabled: z.boolean().default(false),
  schedule_days: z.array(z.number().int().min(1).max(7)).max(7).default([1, 2, 3, 4, 5]),
  schedule_hour: z.number().int().min(0).max(23).default(7),
  alert_min_score: z.number().int().min(0).max(100).default(70),
});
