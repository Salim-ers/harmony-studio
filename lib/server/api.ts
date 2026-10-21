/**
 * Enveloppe des routes API privées : authentification serveur obligatoire,
 * contrôle d'origine pour les méthodes mutantes, limitation de débit et
 * gestion d'erreurs homogène. Masquer un bouton côté interface ne suffit jamais.
 */
import { requireSession, type Session } from './auth';
import { assertSameOrigin, toResponse } from './http';
import { consume, clientIp, type LimitName } from './ratelimit';

type Ctx<P> = { request: Request; session: Session; params: P; ip: string };
type Options = { limit?: LimitName; skipOrigin?: boolean };

export function adminRoute<P = Record<string, string>>(
  handler: (ctx: Ctx<P>) => Promise<Response>,
  options: Options = {},
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    try {
      const session = await requireSession();
      const method = request.method.toUpperCase();
      if (!['GET', 'HEAD'].includes(method) && !options.skipOrigin) assertSameOrigin(request);
      const ip = clientIp(request);
      const limit = options.limit ?? (['GET', 'HEAD'].includes(method) ? undefined : 'write');
      if (limit) await consume(limit, `admin:${limit}`);
      const params = ((await context?.params) ?? {}) as P;
      return await handler({ request, session, params, ip });
    } catch (error) {
      return toResponse(error, new URL(request.url).pathname);
    }
  };
}
