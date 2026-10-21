/** Devis : totaux TOUJOURS calculés côté serveur, régime de TVA configurable (jamais imposé). */
import { z } from 'zod';
import { db } from './db';

export const quoteLineSchema = z.object({
  label: z.string().trim().min(1).max(200),
  description: z.string().max(1000).default(''),
  quantity: z.number().min(0).max(10000),
  unitPrice: z.number().min(0).max(1_000_000),
  unit: z.string().max(20).default('forfait'),
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

export function computeTotals(lines: QuoteLine[], regime: 'a_definir' | 'franchise' | 'tva', rate: number) {
  const ht = Math.round(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
  const tva = regime === 'tva' ? Math.round(ht * rate) / 100 : 0;
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}

export async function nextQuoteNumber() {
  const year = new Date().getFullYear();
  const rows = await db()<{ n: number }>`SELECT count(*)::int AS n FROM quotes WHERE number LIKE ${`DEV-${year}-%`}`;
  let n = Number(rows[0]?.n ?? 0) + 1;
  for (;;) {
    const candidate = `DEV-${year}-${String(n).padStart(3, '0')}`;
    const exists = await db()`SELECT 1 FROM quotes WHERE number = ${candidate}`;
    if (!exists.length) return candidate;
    n++;
  }
}

export const quoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  client_name: z.string().trim().max(200).default(''),
  client_details: z.string().max(1000).default(''),
  prospect_id: z.string().uuid().nullable().default(null),
  project_id: z.string().uuid().nullable().default(null),
  lines: z.array(quoteLineSchema).max(60).default([]),
  vat_regime: z.enum(['a_definir', 'franchise', 'tva']).optional(),
  vat_rate: z.number().min(0).max(30).optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: z.string().max(4000).default(''),
});
