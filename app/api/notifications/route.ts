import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const items = await db()`SELECT id, kind, title, body, link, read_at, created_at FROM notifications ORDER BY created_at DESC LIMIT 50`;
  const [{ n }] = await db()<{ n: number }>`SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL`;
  return json({ items, unread: Number(n) });
});

export const PATCH = adminRoute(async ({ request }) => {
  const b = await readJson(request, z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }));
  if (b.all) await db()`UPDATE notifications SET read_at = now() WHERE read_at IS NULL`;
  else if (b.ids?.length) await db()`UPDATE notifications SET read_at = now() WHERE id = ANY(${b.ids}::uuid[])`;
  return json({ ok: true });
});
