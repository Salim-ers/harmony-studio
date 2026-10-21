import { requireAdmin,assertOrigin,apiError } from '@/lib/auth';
import { db } from '@/lib/db';
import { DEFAULT_MATRIX } from '@/lib/matrix';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    await requireAdmin();const sql=db();
    const [settings]=await sql`SELECT matrix,watch_city,watch_enabled FROM app_settings WHERE id=1`;
    return Response.json({settings:settings ? {...settings,matrix:settings.matrix || DEFAULT_MATRIX} : {matrix:DEFAULT_MATRIX,watch_city:'Oise',watch_enabled:false}});
  }catch(e){return apiError(e)}
}
export async function PATCH(request:Request) {
  try {
    await requireAdmin();assertOrigin(request);
    const b=await request.json();
    const matrix=String(b.matrix||'').slice(0,25000);
    const city=String(b.watch_city||'Oise').slice(0,90);
    const enabled=b.watch_enabled===true;
    if(matrix.length<30)throw new Error('INVALID:La matrice doit contenir au moins 30 caractères.');
    const sql=db();
    await sql`INSERT INTO app_settings(id,matrix,watch_city,watch_enabled) VALUES(1,${matrix},${city},${enabled})
      ON CONFLICT(id) DO UPDATE SET matrix=excluded.matrix,watch_city=excluded.watch_city,watch_enabled=excluded.watch_enabled,updated_at=now()`;
    return Response.json({ok:true});
  }catch(e){return apiError(e)}
}
