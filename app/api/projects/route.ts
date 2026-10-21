import { requireAdmin,assertOrigin,apiError } from '@/lib/auth';
import { db } from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    await requireAdmin();const sql=db();
    const projects=await sql`SELECT id,name,category,style,brief,images,summary,created_at,updated_at FROM projects ORDER BY updated_at DESC LIMIT 100`;
    return Response.json({projects},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return apiError(e)}
}
export async function DELETE(request:Request) {
  try {
    await requireAdmin();assertOrigin(request);
    const b=await request.json(),id=String(b.id||'');
    if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID:Identifiant invalide.');
    const sql=db();await sql`DELETE FROM projects WHERE id=${id}`;
    return Response.json({ok:true});
  }catch(e){return apiError(e)}
}
