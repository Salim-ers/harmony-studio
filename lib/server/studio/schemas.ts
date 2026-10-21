import { z } from 'zod';
import { DELIVERABLES } from '@/lib/shared/constants';

const text = (max: number) => z.string().trim().max(max).default('');

export const briefSchema = z.object({
  clientName: text(150), sector: text(120), city: text(120), zone: text(300), brief: text(6000), style: text(200), palette: text(300),
  typography: text(200), features: z.array(z.string().trim().min(1).max(120)).max(30).default([]), cta: text(200), services: text(3000),
  objectives: text(1500), audience: text(800), address: text(300), phone: text(40), email: text(150), hours: text(600), socials: text(600),
  prices: text(2000), legal: text(2000), references: text(1500), constraints: text(1500), pages: text(500),
  motion: z.enum(['sobre', 'dynamique', 'spectaculaire']).default('dynamique'),
  domain: z.string().trim().max(200).regex(/^(https:\/\/[a-z0-9.-]+)?$/i, 'Domaine attendu sous la forme https://www.exemple.fr').default(''),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(150),
  deliverable: z.enum(DELIVERABLES.map((d) => d.key) as [string, ...string[]]),
  render: z.enum(['react', 'html']).default('react'),
  prospect_id: z.string().uuid().nullable().default(null),
  brief: briefSchema,
  matrix_overrides: z.object({ design: text(4000), technique: text(4000), seo: text(4000), audit: text(4000) }).partial().default({}),
});
