import { requireAdmin,assertOrigin,apiError } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateSite } from '@/lib/claude';
import { DEFAULT_MATRIX } from '@/lib/matrix';
export const maxDuration=120;
export async function POST(request:Request) {
  try {
    await requireAdmin();assertOrigin(request);
    const b=await request.json();
    const name=String(b.name||'').trim().slice(0,150), brief=String(b.brief||'').trim().slice(0,9000);
    const category=String(b.category||'Site vitrine').slice(0,120), style=String(b.style||'Premium contemporain').slice(0,200);
    const instructions=String(b.instructions||'').slice(0,5000);
    const images=Array.isArray(b.images) ? b.images.filter((x:unknown)=>typeof x==='string').slice(0,6) as string[] : [];
    if(!name || !brief)throw new Error('INVALID:Nom et description du projet requis.');
    const sql=db();
    let previousHtml='', projectId:string|undefined;
    if(b.projectId){
      projectId=String(b.projectId);
      if(!/^[a-f0-9-]{36}$/i.test(projectId))throw new Error('INVALID:Projet incorrect.');
      const [old]=await sql`SELECT current_html FROM projects WHERE id=${projectId}`;
      if(!old)throw new Error('INVALID:Projet introuvable.');
      previousHtml=String(old.current_html||'');
    }
    const [settings]=await sql`SELECT matrix FROM app_settings WHERE id=1`;
    const {html,summary}=await generateSite({name,category,style,brief,images,matrix:String(settings?.matrix||DEFAULT_MATRIX),previousHtml,instructions});
    if(html.length>750000)throw new Error('INVALID:HTML généré trop volumineux.');
    if(projectId){
      await sql`UPDATE projects SET name=${name},brief=${brief},category=${category},style=${style},images=${JSON.stringify(images)}::jsonb,current_html=${html},summary=${summary},updated_at=now() WHERE id=${projectId}`;
    }else{
      const [row]=await sql`INSERT INTO projects(name,category,style,brief,images,current_html,summary)
        VALUES(${name},${category},${style},${brief},${JSON.stringify(images)}::jsonb,${html},${summary}) RETURNING id`;
      projectId=String(row.id);
    }
    await sql`INSERT INTO project_versions(project_id,html,instructions) VALUES(${projectId},${html},${instructions})`;
    return Response.json({ok:true,projectId,html,summary});
  }catch(e){return apiError(e)}
}
