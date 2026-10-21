import { apiError, assertOrigin, requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
export const dynamic='force-dynamic';
const statuses = ['Nouveau','À contacter','Contacté','Relance','Devis','Gagné','Perdu'];
export async function GET() {
  try {
    await requireAdmin();
    const sql=db();
    const prospects = await sql`SELECT id,name,source_url,source_type,city,category,evidence,signal,score,status,notes,created_at,updated_at FROM prospects ORDER BY created_at DESC LIMIT 700`;
    return Response.json({prospects},{headers:{'Cache-Control':'no-store'}});
  } catch(e){return apiError(e)}
}
export async function POST(request:Request) {
  try {
    await requireAdmin();assertOrigin(request);
    const b=await request.json();
    const name=String(b.name||'').trim().slice(0,180);
    const source_url=String(b.source_url||'').trim().slice(0,1500);
    if(!name) throw new Error('INVALID:Nom requis.');
    try {const url=new URL(source_url);if(!['https:','http:'].includes(url.protocol))throw new Error();}
    catch {throw new Error('INVALID:URL publique http(s) requise.');}
    const city=String(b.city||'').slice(0,90),category=String(b.category||'Site vitrine').slice(0,100);
    const evidence=String(b.evidence||'').slice(0,900),notes=String(b.notes||'').slice(0,2000);
    const sql=db();
    const rows=await sql`INSERT INTO prospects(name,source_url,source_type,city,category,evidence,signal,score,notes)
      VALUES(${name},${source_url},'Ajout manuel',${city},${category},${evidence},'À vérifier',50,${notes})
      ON CONFLICT (source_url) DO NOTHING RETURNING id`;
    if(!rows.length) return Response.json({error:'Ce lien existe déjà.'},{status:409});
    return Response.json({ok:true});
  } catch(e){return apiError(e)}
}
export async function PATCH(request:Request) {
  try {
    await requireAdmin();assertOrigin(request);
    const b=await request.json();
    if(!statuses.includes(b.status))throw new Error('INVALID:Statut invalide.');
    const id=String(b.id||'');
    if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID:Identifiant invalide.');
    const notes=String(b.notes||'').slice(0,3500),sql=db();
    await sql`UPDATE prospects SET status=${b.status},notes=${notes},updated_at=now() WHERE id=${id}`;
    return Response.json({ok:true});
  }catch(e){return apiError(e)}
}
export async function DELETE(request:Request) {
  try {
    await requireAdmin();assertOrigin(request);
    const b=await request.json();
    const id=String(b.id||'');
    if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID:Identifiant invalide.');
    const sql=db(); await sql`DELETE FROM prospects WHERE id=${id}`;
    return Response.json({ok:true});
  }catch(e){return apiError(e)}
}
