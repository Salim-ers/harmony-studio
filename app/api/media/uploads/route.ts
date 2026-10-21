import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { json, readJson } from '@/lib/server/http';
import { initUpload } from '@/lib/server/studio/media';

const schema = z.object({ name: z.string().max(300), size: z.number().int().positive(), mime: z.string().max(100) });

export const POST = adminRoute(async ({ request }) => {
  const b = await readJson(request, schema);
  return json(await initUpload(b), { status: 201 });
}, { limit: 'upload' });
