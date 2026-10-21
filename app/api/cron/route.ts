import { db } from '@/lib/db';
import { runSearch } from '@/lib/prospect-search';
export const maxDuration=120;
export async function GET(request:Request) {
  const key=process.env.CRON_SECRET;
  if(!key || request.headers.get('authorization')!==`Bearer ${key}`)return Response.json({error:'Non autorisé'},{status:401});
  try{
    const sql=db(); const [settings]=await sql`SELECT watch_city,watch_enabled FROM app_settings WHERE id=1`;
    if(!settings?.watch_enabled)return Response.json({ok:true,message:'Veille désactivée'});
    const result=await runSearch(String(settings.watch_city||'Oise'),'demandes');
    return Response.json({ok:true,...result});
  }catch(e){console.error('Cron failed',e);return Response.json({error:'Échec de la veille, consulter les logs.'},{status:500})}
}
