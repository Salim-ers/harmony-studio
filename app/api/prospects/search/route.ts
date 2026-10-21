import { requireAdmin,assertOrigin,apiError } from '@/lib/auth';
import { runSearch, type SearchMode } from '@/lib/prospect-search';
export const maxDuration=60;
export async function POST(request:Request) {
  try {
    await requireAdmin();assertOrigin(request);
    const body=await request.json();
    const mode:SearchMode=['demandes','commerces','logiciels'].includes(body.mode) ? body.mode :'demandes';
    const city=String(body.city||'Oise').slice(0,90);
    const custom=String(body.customQuery||'').slice(0,250);
    const result=await runSearch(city,mode,custom);
    return Response.json({ok:true,...result});
  }catch(e){return apiError(e)}
}
