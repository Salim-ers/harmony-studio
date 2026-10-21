import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { integrationStatuses, mocksEnabled } from '@/lib/server/env';
import { json, readJson } from '@/lib/server/http';
import { configSchema, getConfig, saveConfig, DEFAULT_CONFIG } from '@/lib/server/settings';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const config = await getConfig();
  return json({ config, defaults: { catalog: DEFAULT_CONFIG.catalog, pricing: DEFAULT_CONFIG.pricing }, integrations: integrationStatuses(), mocks: mocksEnabled() });
});

const patchSchema = configSchema.partial().extend({ legacy: z.object({ watch_city: z.string().max(90), watch_enabled: z.boolean() }).optional() });

export const PATCH = adminRoute(async ({ request }) => {
  const b = await readJson(request, patchSchema, 200_000);
  const { legacy, ...rest } = b;
  const saved = await saveConfig(rest);
  if (legacy) await db()`UPDATE app_settings SET watch_city = ${legacy.watch_city}, watch_enabled = ${legacy.watch_enabled}, updated_at = now() WHERE id = 1`;
  await audit('parametres_modifies', {}, { sections: Object.keys(b) });
  return json({ ok: true, config: saved });
});
