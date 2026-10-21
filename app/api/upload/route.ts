import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireAdmin,assertOrigin,apiError } from '@/lib/auth';
export async function POST(request:Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    // La notification Vercel est authentifiée par le jeton interne Blob.
    // Ne pas imposer ici le cookie admin : Vercel appelle aussi ce handler.
    const result = await handleUpload({body,request,
      onBeforeGenerateToken:async()=>{
        await requireAdmin();assertOrigin(request);
        return {allowedContentTypes:['image/png','image/jpeg','image/webp'], maximumSizeInBytes: 15*1024*1024,addRandomSuffix:true};
      },
      onUploadCompleted:async()=>{ /* Pas de données sensibles dans les logs. */ }
    });
    return Response.json(result);
  }catch(e){return apiError(e)}
}
