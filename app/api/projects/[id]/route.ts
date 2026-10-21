import {requireAdmin,apiError} from '@/lib/auth';
import {db} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireAdmin();
    const {id}=await params;
    if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID:Identifiant invalide.');
    const sql=db();const [project]=await sql`SELECT id,name,category,style,brief,images,current_html,summary,created_at,updated_at FROM projects WHERE id=${id}`;
    if(!project)return Response.json({error:'Projet introuvable'},{status:404});
    return Response.json({project},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return apiError(e)}
}
