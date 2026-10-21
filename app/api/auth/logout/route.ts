import { assertOrigin,clearSession,apiError } from '@/lib/auth';
export async function POST(request:Request) {
  try {assertOrigin(request); await clearSession(); return Response.json({ok:true});}
  catch(e){return apiError(e)}
}
