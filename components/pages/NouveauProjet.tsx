'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, ImagePlus, Loader2, Sparkles, Wand2, X, Zap } from 'lucide-react';
import { api } from '@/lib/client/api';
import { uploadMedia } from '@/lib/client/upload';
import { ASSET_ROLES, DELIVERABLES, STYLES, deliverableKind } from '@/lib/shared/constants';
import { Alert, PageHead, useErrorToast, useToast } from '../ui';

type Pending = { key: string; file: File; preview: string | null; role: keyof typeof ASSET_ROLES; alt: string; progress: number; mediaId?: string; error?: string };
const FEATURE_SUGGESTIONS = ['Formulaire de contact', 'Galerie photos', 'Carte / plan d’accès', 'Menu / carte administrable', 'Réservation', 'Commande en ligne', 'Paiement en ligne', 'Espace client', 'Blog / actualités', 'FAQ', 'Multilingue', 'Avis clients réels'];
const STEPS = ['Projet', 'Livrable', 'Brief', 'Médias', 'Style'];

export default function NouveauProjet() {
  const router = useRouter();
  const params = useSearchParams();
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState('');
  const [autoContinue, setAutoContinue] = useState(false);
  const [deliverable, setDeliverable] = useState('vitrine');
  const [render, setRender] = useState<'react' | 'html'>('react');
  const [name, setName] = useState('');
  const [b, setB] = useState({ clientName: '', sector: '', city: '', zone: '', brief: '', style: 'Très premium', palette: '', typography: '', features: [] as string[], cta: '', services: '', objectives: '', audience: '', address: '', phone: '', email: '', hours: '', socials: '', prices: '', legal: '', references: '', constraints: '', pages: '', motion: 'dynamique', domain: '' });
  const [files, setFiles] = useState<Pending[]>([]);
  const prospectId = params.get('prospect');

  useEffect(() => {
    if (!prospectId) return;
    api<{ prospect: { name: string; activity: string; city: string; location_verified: boolean; website: string | null } }>(`/api/prospects/${prospectId}`).then(({ prospect }) => {
      setName(prospect.name);
      setB((x) => ({ ...x, clientName: prospect.name, sector: prospect.activity, city: prospect.location_verified ? prospect.city : x.city, references: prospect.website ? `Site actuel du client : ${prospect.website}` : x.references }));
    }).catch(() => undefined);
  }, [prospectId]);

  const set = (k: keyof typeof b) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setB((x) => ({ ...x, [k]: e.target.value }));
  const isApp = deliverableKind(deliverable) === 'app';
  const canNext = [name.trim() && b.clientName.trim(), true, b.brief.trim().length >= 15, true, true][step];

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...list].slice(0, 30 - files.length).map((file, i) => ({
      key: `${file.name}-${file.size}-${Date.now()}-${i}`, file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      role: (file.type === 'application/pdf' ? 'document' : /logo/i.test(file.name) ? 'logo' : 'photo') as Pending['role'], alt: '', progress: 0,
    }));
    setFiles((f) => [...f, ...next]);
  }

  async function create() {
    setBusy('Création du projet…');
    try {
      const project = await api<{ id: string }>('/api/projects', { json: { name, deliverable, render, prospect_id: prospectId, brief: b } });
      let failures = 0;
      for (const [i, f] of files.entries()) {
        setBusy(`Envoi privé des médias (${i + 1}/${files.length})…`);
        try {
          const media = f.mediaId ? { id: f.mediaId } : await uploadMedia(f.file, (r) => setFiles((all) => all.map((x) => (x.key === f.key ? { ...x, progress: r } : x))));
          await api(`/api/projects/${project.id}/assets`, { json: { mediaId: media.id, role: f.role, alt: f.alt } });
        } catch (e) {
          failures++;
          setFiles((all) => all.map((x) => (x.key === f.key ? { ...x, error: e instanceof Error ? e.message : 'Échec' } : x)));
        }
      }
      if (failures) notify(`${failures} média(s) refusé(s) — vous pourrez les remplacer dans le Studio.`, 'error');
      setBusy('Lancement de la planification…');
      await api(`/api/projects/${project.id}/jobs`, { json: { kind: 'creation', autoContinue } });
      router.push(`/creation/${project.id}`);
    } catch (e) {
      onError(e);
      setBusy('');
    }
  }

  return (
    <>
      <PageHead eyebrow="Création IA" title="Une idée + des photos = un projet." desc="2 ou 3 phrases suffisent. Claude propose ensuite un brief enrichi et un plan que vous validez avant toute génération." />
      <ol className="row row-wrap" style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', gap: 6 }} aria-label="Étapes">
        {STEPS.map((s, i) => (
          <li key={s}><button className="chip" aria-pressed={i === step} aria-current={i === step ? 'step' : undefined} onClick={() => (i < step || canNext) && setStep(i)} disabled={i > step && !canNext}>{i < step ? <Check size={13} /> : `${i + 1}.`} {s}</button></li>
        ))}
      </ol>
      <div className="grid g-main-side">
        <section className="card card-pad stack" key={step} style={{ animation: 'rise .4s var(--ease) both' }}>
          {step === 0 ? (
            <div className="form-grid">
              <div className="field span-2"><label htmlFor="n-name">Nom du projet *</label><input id="n-name" className="input" value={name} onChange={(e) => { setName(e.target.value); if (!b.clientName) setB((x) => ({ ...x, clientName: e.target.value })); }} placeholder="ex. Site Boulangerie Dupont" /></div>
              <div className="field"><label htmlFor="n-client">Nom de l’entreprise cliente *</label><input id="n-client" className="input" value={b.clientName} onChange={set('clientName')} /></div>
              <div className="field"><label htmlFor="n-sector">Métier / domaine</label><input id="n-sector" className="input" value={b.sector} onChange={set('sector')} placeholder="ex. boulangerie-pâtisserie artisanale" /></div>
              <div className="field"><label htmlFor="n-city">Ville</label><input id="n-city" className="input" value={b.city} onChange={set('city')} placeholder="ex. Creil" /></div>
              <div className="field"><label htmlFor="n-zone">Zone réellement desservie</label><input id="n-zone" className="input" value={b.zone} onChange={set('zone')} placeholder="ex. Creil, Nogent-sur-Oise, Montataire" /></div>
              {prospectId ? <div className="span-2"><Alert kind="info">Projet rattaché au prospect sélectionné.</Alert></div> : null}
            </div>
          ) : null}
          {step === 1 ? (
            <>
              <div className="grid g-3" style={{ gap: 10 }}>
                {DELIVERABLES.map((d) => (
                  <button key={d.key} className="card card-pad card-hover" style={{ textAlign: 'left', boxShadow: deliverable === d.key ? 'var(--focus)' : 'none', borderColor: deliverable === d.key ? 'var(--gold)' : undefined }} aria-pressed={deliverable === d.key} onClick={() => setDeliverable(d.key)}>
                    <div className="strong small">{d.label}</div><div className="tiny muted">{d.kind === 'app' ? 'Application full-stack (Next.js)' : 'Site'}</div>
                  </button>
                ))}
              </div>
              {isApp ? (
                <Alert kind="warn">Application métier : Claude génère un vrai projet Next.js (routes serveur, base de données, authentification, tests). Il doit être <b>construit et testé dans le runner isolé</b> avant d’être considéré comme fonctionnel ; sans runner configuré, le blocage sera affiché clairement. Un logiciel complexe demande clarification et validation humaine.</Alert>
              ) : (
                <>
                  <div className="field"><span className="label">Technologie du site</span>
                    <div className="segmented"><button aria-pressed={render === 'react'} onClick={() => setRender('react')}><Zap size={14} />React + Motion (recommandé)</button><button aria-pressed={render === 'html'} onClick={() => setRender('html')}>HTML statique léger</button></div>
                    <span className="hint">{render === 'react' ? 'Projet Vite + React 19 + React Router + kit motion Harmony, prêt pour Vercel.' : 'Pages HTML/CSS/JS sans dépendance, hébergeables partout.'}</span>
                  </div>
                  {render === 'react' ? (
                    <div className="field"><span className="label">Intensité du motion design</span>
                      <div className="grid g-3" style={{ gap: 10 }}>
                        {[['sobre', 'Sobre', 'Apparitions élégantes et discrètes'], ['dynamique', 'Dynamique', 'Parallaxe, cascades, cartes interactives'], ['spectaculaire', 'Spectaculaire', 'Effet waouh : titres révélés, CTA magnétiques, profondeur']].map(([k, l, d]) => (
                          <button key={k} className="card card-pad card-hover" style={{ textAlign: 'left', boxShadow: b.motion === k ? 'var(--focus)' : 'none', borderColor: b.motion === k ? 'var(--gold)' : undefined }} aria-pressed={b.motion === k} onClick={() => setB((x) => ({ ...x, motion: k }))}>
                            <div className="strong small">{l}</div><div className="tiny muted">{d}</div>
                          </button>
                        ))}
                      </div>
                      <span className="hint">Toujours désactivé automatiquement pour les visiteurs qui ont choisi « réduire les animations ».</span>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : null}
          {step === 2 ? (
            <>
              <div className="field"><label htmlFor="n-brief">Brief libre * <span className="hint">(2–3 phrases suffisent)</span></label><textarea id="n-brief" className="textarea" rows={5} value={b.brief} onChange={set('brief')} placeholder="ex. Site premium pour une boulangerie artisanale avec la carte de nos produits et une prise de contact. Ambiance chaleureuse, photos de nos pains." /></div>
              <Alert kind="info">Tout ce qui n’est pas renseigné restera « À renseigner » sur le site : rien n’est inventé (avis, chiffres, horaires, tarifs, adresse…).</Alert>
              <details open={!!(b.services || b.phone || b.email)}>
                <summary className="strong small" style={{ cursor: 'pointer' }}>Données confirmées (facultatif mais recommandé)</summary>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="field span-2"><label htmlFor="n-serv">Prestations / produits réels</label><textarea id="n-serv" className="textarea" rows={3} value={b.services} onChange={set('services')} /></div>
                  <div className="field"><label htmlFor="n-obj">Objectifs</label><input id="n-obj" className="input" value={b.objectives} onChange={set('objectives')} placeholder="ex. plus d’appels, commandes de gâteaux" /></div>
                  <div className="field"><label htmlFor="n-aud">Clientèle</label><input id="n-aud" className="input" value={b.audience} onChange={set('audience')} /></div>
                  <div className="field"><label htmlFor="n-phone">Téléphone</label><input id="n-phone" className="input" value={b.phone} onChange={set('phone')} /></div>
                  <div className="field"><label htmlFor="n-email">E-mail</label><input id="n-email" className="input" type="email" value={b.email} onChange={set('email')} /></div>
                  <div className="field span-2"><label htmlFor="n-addr">Adresse</label><input id="n-addr" className="input" value={b.address} onChange={set('address')} /></div>
                  <div className="field"><label htmlFor="n-hours">Horaires</label><textarea id="n-hours" className="textarea" rows={2} value={b.hours} onChange={set('hours')} /></div>
                  <div className="field"><label htmlFor="n-soc">Réseaux sociaux (URL)</label><textarea id="n-soc" className="textarea" rows={2} value={b.socials} onChange={set('socials')} /></div>
                  <div className="field"><label htmlFor="n-prices">Tarifs confirmés</label><textarea id="n-prices" className="textarea" rows={2} value={b.prices} onChange={set('prices')} /></div>
                  <div className="field"><label htmlFor="n-legal">Mentions légales connues</label><textarea id="n-legal" className="textarea" rows={2} value={b.legal} onChange={set('legal')} placeholder="raison sociale, SIRET, hébergeur…" /></div>
                  <div className="field"><label htmlFor="n-pages">Pages souhaitées</label><input id="n-pages" className="input" value={b.pages} onChange={set('pages')} placeholder="laisser Claude proposer" /></div>
                  <div className="field"><label htmlFor="n-domain">Domaine du site (si connu)</label><input id="n-domain" className="input" value={b.domain} onChange={set('domain')} placeholder="https://www.exemple.fr" /></div>
                  <div className="field span-2"><label htmlFor="n-ref">Références autorisées (sites dont vous pouvez vous inspirer)</label><textarea id="n-ref" className="textarea" rows={2} value={b.references} onChange={set('references')} /><span className="hint">Inspiration uniquement : le code et les textes d’autres sites ne sont jamais copiés.</span></div>
                  <div className="field span-2"><label htmlFor="n-cons">Contraintes</label><input id="n-cons" className="input" value={b.constraints} onChange={set('constraints')} /></div>
                </div>
              </details>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <label className="dropzone" onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }} onDragLeave={(e) => e.currentTarget.classList.remove('over')} onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); addFiles(e.dataTransfer.files); }}>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                <ImagePlus size={24} /><div className="strong small" style={{ marginTop: 6 }}>Glissez vos photos, logo, menus ou documents</div>
                <div className="tiny">JPEG, PNG, WebP, AVIF (20 Mo) · PDF (15 Mo) · stockage privé, originaux conservés</div>
              </label>
              <div className="stack" style={{ gap: 8 }}>
                {files.map((f) => (
                  <div key={f.key} className="row" style={{ gap: 10, alignItems: 'center' }}>
                    <div className="thumb" style={{ width: 64, flex: 'none' }}>{f.preview ? <img src={f.preview} alt="" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><FileText size={20} /></div>}</div>
                    <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
                      <div className="row"><span className="small strong ellipsis">{f.file.name}</span><span className="tiny muted">{(f.file.size / 1024 / 1024).toFixed(1)} Mo</span></div>
                      <div className="row">
                        <select className="select" style={{ width: 170, height: 32 }} value={f.role} aria-label="Rôle du média" onChange={(e) => setFiles((all) => all.map((x) => (x.key === f.key ? { ...x, role: e.target.value as Pending['role'] } : x)))}>
                          {Object.entries(ASSET_ROLES).filter(([k]) => f.file.type === 'application/pdf' ? ['document', 'charte'].includes(k) : true).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        <input className="input" style={{ height: 32 }} placeholder="Description (texte alternatif)" value={f.alt} onChange={(e) => setFiles((all) => all.map((x) => (x.key === f.key ? { ...x, alt: e.target.value } : x)))} aria-label="Description" />
                      </div>
                      {f.progress > 0 && f.progress < 1 ? <div className="progress"><span style={{ width: `${f.progress * 100}%` }} /></div> : null}
                      {f.error ? <span className="tiny" style={{ color: 'var(--red)' }}>{f.error}</span> : null}
                    </div>
                    <button className="btn btn-ghost btn-icon" aria-label="Retirer" onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}><X size={15} /></button>
                  </div>
                ))}
                {!files.length ? <p className="small muted">Sans photo, le design s’appuiera sur la typographie, la couleur et des motifs — jamais sur des images trouvées en ligne ou des visages générés.</p> : null}
              </div>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <div className="field"><span className="label">Style souhaité</span><div className="chips">{STYLES.map((s) => <button key={s} className="chip" aria-pressed={b.style === s} onClick={() => setB((x) => ({ ...x, style: s }))}>{s}</button>)}</div></div>
              <div className="form-grid">
                <div className="field"><label htmlFor="n-pal">Palette</label><input id="n-pal" className="input" value={b.palette} onChange={set('palette')} placeholder="ex. crème, brun chaud, or — ou laisser Claude proposer" /></div>
                <div className="field"><label htmlFor="n-typo">Typographies</label><input id="n-typo" className="input" value={b.typography} onChange={set('typography')} placeholder="facultatif" /></div>
                <div className="field span-2"><label htmlFor="n-cta">Appel à l’action principal</label><input id="n-cta" className="input" value={b.cta} onChange={set('cta')} placeholder="ex. Commander un gâteau, Appeler, Demander un devis" /></div>
              </div>
              <div className="field"><span className="label">Fonctionnalités réellement requises</span>
                <div className="chips">{FEATURE_SUGGESTIONS.map((f) => <button key={f} className="chip" aria-pressed={b.features.includes(f)} onClick={() => setB((x) => ({ ...x, features: x.features.includes(f) ? x.features.filter((y) => y !== f) : [...x.features, f] }))}>{f}</button>)}</div>
                <span className="hint">Paiement, réservation ou espace client ne sont jamais simulés : sans intégration réelle (ex. Stripe), ils apparaissent « non configurés ».</span>
              </div>
              <label className="check"><input type="checkbox" checked={autoContinue} onChange={(e) => setAutoContinue(e.target.checked)} />Enchaîner la génération automatiquement si le plan ne contient aucune question bloquante</label>
            </>
          ) : null}
          <div className="row row-wrap between" style={{ marginTop: 8 }}>
            <button className="btn" disabled={step === 0 || !!busy} onClick={() => setStep((s) => s - 1)}><ArrowLeft size={15} />Précédent</button>
            {step < STEPS.length - 1 ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Suivant<ArrowRight size={15} /></button>
              : <button className="btn btn-gold btn-lg" disabled={!!busy || !name.trim() || b.brief.trim().length < 15} onClick={create}>{busy ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}{busy || 'Créer et lancer la planification'}</button>}
          </div>
        </section>
        <aside className="stack">
          <section className="card card-pad stack" style={{ gap: 10 }}>
            <div className="card-title"><Sparkles size={16} color="var(--gold)" />Comment ça se passe</div>
            <ol className="small muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>Claude analyse le brief et vos photos, puis propose un <b>brief enrichi, les pages et la direction artistique</b>.</li>
              <li>Vous <b>validez ou corrigez le plan</b> (et répondez aux éventuelles questions bloquantes).</li>
              <li>Génération page par page, assemblage{render === 'react' && !isApp ? ', compilation React' : ''} et <b>contrôles qualité automatiques</b>.</li>
              <li>Aperçu isolé desktop / tablette / mobile, modifications par conversation, versions et export ZIP.</li>
            </ol>
            <p className="tiny faint">Chaque appel à Claude est facturé sur votre compte API Anthropic (pas sur l’abonnement Claude.ai) et plafonné par le budget défini dans Paramètres.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
