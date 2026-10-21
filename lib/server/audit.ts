import { db } from './db';
import { logError } from './http';

/** Journal d'audit des actions importantes. Ne jamais y placer de secret ni de contenu privé volumineux. */
export async function audit(action: string, target: { type?: string; id?: string } = {}, detail: Record<string, unknown> = {}, ipHash = '') {
  try {
    await db()`INSERT INTO audit_logs(action, target_type, target_id, detail, ip_hash)
      VALUES (${action}, ${target.type ?? ''}, ${target.id ?? ''}, ${JSON.stringify(detail)}::jsonb, ${ipHash})`;
  } catch (e) {
    logError('audit', e, { action });
  }
}

export async function notify(kind: string, title: string, body = '', link = '') {
  try {
    await db()`INSERT INTO notifications(kind, title, body, link) VALUES (${kind}, ${title}, ${body}, ${link})`;
  } catch (e) {
    logError('notify', e, { kind });
  }
}
