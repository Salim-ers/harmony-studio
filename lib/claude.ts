import { DEFAULT_MATRIX } from './matrix';

type Parameters = {
  name: string; category:string; style:string; brief:string; images:string[];
  matrix:string; previousHtml?:string; instructions?:string;
};
function parseResult(text:string) {
  let clean = text.trim();
  if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try {
    const obj = JSON.parse(clean) as {html?: string;summary?:string};
    if (typeof obj.html === 'string' && /<html|<!doctype/i.test(obj.html))
      return {html:obj.html,summary:String(obj.summary||'Site généré').slice(0,1000)};
  } catch {}
  throw new Error('La réponse Claude ne contient pas de HTML JSON valide. Réessaie en simplifiant le brief.');
}
export async function generateSite(p:Parameters) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY non configurée.');
  const acceptedImages = p.images.filter(u=>{
    try { const url = new URL(u); return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com'); }
    catch { return false; }
  }).slice(0,6);
  const prompt = `Nom du projet : ${p.name}\nActivité : ${p.category}\nDirection artistique : ${p.style}\nBrief : ${p.brief}\nPhotos à exploiter : ${acceptedImages.join('\n') || 'Aucune'}\nInstructions de modification : ${p.instructions || 'Première version'}\n${p.previousHtml ? '\nVERSION PRÉCÉDENTE À AMÉLIORER :\n' + p.previousHtml.slice(0,100000) : ''}\n\nRends uniquement un objet JSON valide {"html":"<!DOCTYPE html>...", "summary":"..."}. Le HTML doit être complet, autonome, réellement soigné, avec sections pertinentes, une navigation fonctionnelle et les images indiquées. Aucun texte en dehors du JSON.`;
  const response = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST', headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},
    body:JSON.stringify({model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',max_tokens:10000,temperature:0.7,
      system:(p.matrix || DEFAULT_MATRIX).slice(0,25000),
      messages:[{role:'user',content:[{type:'text',text:prompt},...acceptedImages.map(url=>({type:'image',source:{type:'url',url}}))]}]
    }), signal:AbortSignal.timeout(110000),cache:'no-store'
  });
  const result = await response.json() as {content?:Array<{type:string;text?:string}>;error?:{message:string};stop_reason?:string};
  if (!response.ok) throw new Error(`Claude : ${result.error?.message || response.status}`);
  if (result.stop_reason === 'max_tokens') throw new Error('Claude a atteint la limite de sortie. Réduis le brief ou demande une version plus compacte.');
  return parseResult((result.content||[]).filter(c=>c.type==='text').map(c=>c.text||'').join('\n'));
}
