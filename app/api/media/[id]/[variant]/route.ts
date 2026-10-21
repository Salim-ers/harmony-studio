import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest } from '@/lib/server/http';
import { readVariant } from '@/lib/server/studio/media';

type P = { id: string; variant: string };

/** Média privé : servi uniquement au propriétaire authentifié, jamais mis en cache public. */
export const GET = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id) || !['original', 'web', 'thumb'].includes(params.variant)) throw badRequest('Paramètres invalides.');
  const media = await readVariant(params.id, params.variant as 'original' | 'web' | 'thumb');
  const pdf = media.mime === 'application/pdf';
  return new Response(new Uint8Array(media.data), {
    headers: {
      'Content-Type': media.mime,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': pdf ? 'attachment' : 'inline',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});
