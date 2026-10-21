import { db } from '@/lib/db';
import { assertOrigin, ipHash, issueSession, verifyPassword, apiError } from '@/lib/auth';
export const runtime='nodejs';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const ip = ipHash(request), sql = db();
    const [r] = await sql`SELECT count(*)::int AS count FROM login_attempts WHERE ip_hash=${ip} AND created_at > now()-interval '15 minutes'`;
    if (Number(r.count) >= 5) return Response.json({error:'Trop de tentatives. Réessaie dans 15 minutes.'},{status:429});
    const body = await request.json() as {email?:string;password?:string};
    const email = (body.email||'').trim().toLowerCase();
    const validEmail = !!process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.trim().toLowerCase();
    const validPassword = verifyPassword(body.password||'');
    if (!validEmail || !validPassword) {
      await sql`INSERT INTO login_attempts(ip_hash) VALUES(${ip})`;
      return Response.json({error:'Identifiants incorrects.'},{status:401});
    }
    await sql`DELETE FROM login_attempts WHERE ip_hash=${ip}`;
    await issueSession();
    return Response.json({ok:true});
  } catch(e){return apiError(e)}
}
