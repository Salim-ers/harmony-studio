'use client';
import {useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
import {upload} from '@vercel/blob/client';
import {
  LayoutDashboard, Search, WandSparkles, FolderKanban, Settings2, LogOut,
  ArrowUpRight, ArrowRight, Check, ChevronRight, Sparkles, Radar, Globe2,
  Target, Users, Layers3, Plus, X, FileDown, ExternalLink, RefreshCw,
  SlidersHorizontal, ImagePlus, Clock3, BriefcaseBusiness, ShieldCheck,
  Zap, Mail, MapPin, CheckCircle2, CircleAlert, Trash2, Pencil, RotateCcw,
  Smartphone, Monitor, Info, Save, ChevronDown, Copy
} from 'lucide-react';
import type {Prospect,Project,Settings} from '@/lib/types';

type View='home'|'prospects'|'create'|'projects'|'settings';
type Mode='demandes'|'commerces'|'logiciels';
const statuses=['Nouveau','À contacter','Contacté','Relance','Devis','Gagné','Perdu'];
const categories=['Site vitrine','Site + SEO','E-commerce / Commande','Logiciel / ERP','Application sur mesure','Autre'];
const styles=['Premium contemporain','Minimaliste luxe','Éditorial & élégant','Audacieux & immersif','Chaleureux & artisanal','Tech / SaaS'];
const nav=[{id:'home',label:'Vue d’ensemble',icon:LayoutDashboard},{id:'prospects',label:'Prospection',icon:Search},{id:'create',label:'Studio IA',icon:WandSparkles},{id:'projects',label:'Mes créations',icon:FolderKanban},{id:'settings',label:'Paramètres',icon:Settings2}] as const;
function prospectDraft(p:Prospect){
  const offering=p.category==='Logiciel / ERP'?'outil de gestion ou logiciel sur mesure':p.category==='Site + SEO'?'site internet avec référencement naturel':'site internet sur mesure';
  return `Bonjour,\n\nJe me permets de vous contacter au nom de Harmony Solutions. Nous accompagnons les commerçants, artisans et professionnels dans la création de sites web, de solutions digitales et d'outils de gestion.\n\nEn découvrant votre activité, je souhaitais savoir si un projet de ${offering} était d'actualité ou pourrait vous intéresser.\n\nJe peux vous proposer un échange rapide et, si cela correspond à vos besoins, une démonstration personnalisée.\n\nBien cordialement,\nSalim — Harmony Solutions`;
}
function exportCSV(rows:Prospect[]){
  const fields=['name','city','category','score','signal','status','source_url','evidence','notes'] as const;
  const safe=(value:unknown)=>{
    let str=String(value??'').replace(/\r?\n/g,' ');
    if(/^[=+@\-\t]/.test(str))str="'"+str; // Empêcher les formules à l'ouverture dans Excel.
    return '"'+str.replace(/"/g,'""')+'"';
  };
  const csv='\uFEFF'+fields.join(';')+'\r\n'+rows.map(r=>fields.map(f=>safe(r[f])).join(';')).join('\r\n');
  const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=u;a.download='harmony-prospects.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function buildPreview(html:string){
  const csp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data: blob:; font-src https: data:; connect-src 'none'; form-action 'none';">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i,`<head$1>${csp}`) : csp+html;
}
function downloadHTML(project:Project){
  const blob=new Blob([project.current_html||''],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=(project.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').slice(0,50)||'site')+'.html';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function api<T=Record<string,unknown>>(path:string, options?:RequestInit):Promise<T>{
  const r=await fetch(path,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...options?.headers}});
  const data=await r.json(); if(!r.ok)throw new Error(data.error||`Erreur ${r.status}`);return data as T;
}
function Panel({children,className=''}:{children:ReactNode;className?:string}){return <div className={'panel '+className}>{children}</div>}
function Heading({overline,title,description,action}:{overline:string;title:string;description?:string;action?:ReactNode}){
  return <div className="page-heading"><div><div className="eyebrow">{overline}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action&&<div className="page-action">{action}</div>}</div>
}
function Empty({icon:Icon,title,description}:{icon:typeof Search;title:string;description:string}){return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{description}</p></div>}

export default function Dashboard(){
  const [view,setView]=useState<View>('home');
  const [sidebar,setSidebar]=useState(false);
  const [prospects,setProspects]=useState<Prospect[]>([]);
  const [projects,setProjects]=useState<Project[]>([]);
  const [settings,setSettings]=useState<Settings>({matrix:'',watch_city:'Oise',watch_enabled:false});
  const [loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const [searchMode,setSearchMode]=useState<Mode>('demandes'),[city,setCity]=useState('Oise'),[customQuery,setCustomQuery]=useState('');
  const [searching,setSearching]=useState(false),[filter,setFilter]=useState('Tous'),[keyword,setKeyword]=useState('');
  const [editing,setEditing]=useState<Prospect|null>(null),[editNotes,setEditNotes]=useState(''),[editStatus,setEditStatus]=useState('Nouveau'),[draft,setDraft]=useState('');
  const [addOpen,setAddOpen]=useState(false),[addForm,setAddForm]=useState({name:'',source_url:'',city:'Oise',category:'Site vitrine',notes:''});
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({name:'',category:'Site vitrine',style:'Premium contemporain',brief:'',instructions:''});
  const [images,setImages]=useState<string[]>([]),[uploading,setUploading]=useState(false),[generating,setGenerating]=useState(false);
  const [activeProjectId,setActiveProjectId]=useState<string|null>(null),[selectedProject,setSelectedProject]=useState<Project|null>(null);
  const [previewMode,setPreviewMode]=useState<'desktop'|'mobile'>('desktop');
  const [matrixDirty,setMatrixDirty]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);try{
      const [p,pr,s]=await Promise.all([
        api<{prospects:Prospect[]}>('/api/prospects'),api<{projects:Project[]}>('/api/projects'),api<{settings:Settings}>('/api/settings')]);
      setProspects(p.prospects);setProjects(pr.projects);setSettings(s.settings);setCity(s.settings.watch_city||'Oise');
    }catch(e){setError((e as Error).message)}finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);
  function inform(message:string){setNotice(message);setError('');window.setTimeout(()=>setNotice(''),5500)}
  function fail(e:unknown){setError(e instanceof Error?e.message:'Une erreur est survenue');setNotice('')}
  function navigate(v:View){setView(v);setSidebar(false);setError('');window.scrollTo({top:0,behavior:'smooth'})}
  const filtered=useMemo(()=>prospects.filter(p=>
    (filter==='Tous'||p.status===filter) && [p.name,p.city,p.category,p.evidence,p.signal].join(' ').toLowerCase().includes(keyword.toLowerCase())),[prospects,filter,keyword]);
  const stats=useMemo(()=>({total:prospects.length,hot:prospects.filter(p=>p.score>=70).length,active:prospects.filter(p=>['Contacté','Relance','Devis'].includes(p.status)).length,wins:prospects.filter(p=>p.status==='Gagné').length}),[prospects]);
  async function searchProspects(){
    setSearching(true);setError('');try{
      const out=await api<{accepted:number;duplicates:number}>('/api/prospects/search',{method:'POST',body:JSON.stringify({city,mode:searchMode,customQuery})});
      const p=await api<{prospects:Prospect[]}>('/api/prospects');setProspects(p.prospects);
      inform(`${out.accepted} nouvelle(s) piste(s) • ${out.duplicates} doublon(s) écarté(s). Chaque besoin reste à vérifier.`);
    }catch(e){fail(e)}finally{setSearching(false)}
  }
  function editProspect(p:Prospect){setEditing(p);setEditStatus(p.status);setEditNotes(p.notes);setDraft(prospectDraft(p))}
  async function saveProspect(){if(!editing)return;setSaving(true);try{
    await api('/api/prospects',{method:'PATCH',body:JSON.stringify({id:editing.id,status:editStatus,notes:editNotes})});
    setProspects(xs=>xs.map(x=>x.id===editing.id?{...x,status:editStatus,notes:editNotes}:x));setEditing(null);inform('Fiche prospect mise à jour.');
  }catch(e){fail(e)}finally{setSaving(false)}}
  async function deleteProspect(p:Prospect){if(!confirm(`Supprimer définitivement ${p.name} ?`))return;
    try{await api('/api/prospects',{method:'DELETE',body:JSON.stringify({id:p.id})});setProspects(ps=>ps.filter(x=>x.id!==p.id));setEditing(null);inform('Prospect supprimé.')}catch(e){fail(e)}
  }
  async function addProspect(){setSaving(true);try{
    await api('/api/prospects',{method:'POST',body:JSON.stringify(addForm)});
    const d=await api<{prospects:Prospect[]}>('/api/prospects');setProspects(d.prospects);setAddOpen(false);setAddForm({name:'',source_url:'',city:'Oise',category:'Site vitrine',notes:''});inform('Prospect ajouté.');
  }catch(e){fail(e)}finally{setSaving(false)}}
  async function uploadFiles(files:FileList|null){if(!files?.length)return;setUploading(true);
    try{const quota=6-images.length;if(quota<=0)throw new Error('Six photos maximum.');
      const urls:string[]=[];
      for(const file of Array.from(files).slice(0,quota)){
        if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Format PNG, JPG, WEBP ou AVIF requis.');
        if(file.size>15*1024*1024)throw new Error('15 Mo maximum par image.');
        const result=await upload('harmony/'+file.name,file,{access:'public',handleUploadUrl:'/api/upload'});urls.push(result.url);
      }
      setImages(prev=>[...prev,...urls]);inform(`${urls.length} photo(s) ajoutée(s).`);
    }catch(e){fail(e)}finally{setUploading(false)}
  }
  async function generate(){if(!form.name.trim()||!form.brief.trim()){setError('Ajoute un nom de projet et un brief.');return;}
    setGenerating(true);setError('');try{
      const result=await api<{projectId:string;html:string;summary:string}>('/api/projects/generate',{method:'POST',body:JSON.stringify({...form,images,projectId:activeProjectId})});
      const p=await api<{projects:Project[]}>('/api/projects');setProjects(p.projects);
      const meta=p.projects.find(x=>x.id===result.projectId);
      const selected=meta?{...meta,current_html:result.html}:null;
      setSelectedProject(selected);setActiveProjectId(result.projectId);setForm(f=>({...f,instructions:''}));navigate('create');inform('Site généré et sauvegardé. Tu peux le prévisualiser, le modifier ou l’exporter.');
    }catch(e){fail(e)}finally{setGenerating(false)}
  }
  function newProject(){setActiveProjectId(null);setSelectedProject(null);setForm({name:'',category:'Site vitrine',style:'Premium contemporain',brief:'',instructions:''});setImages([]);navigate('create')}
  async function openProject(p:Project){try{
    const data=await api<{project:Project}>(`/api/projects/${p.id}`);
    setSelectedProject(data.project);setActiveProjectId(p.id);
    setForm({name:p.name,category:p.category,style:p.style,brief:p.brief,instructions:''});
    setImages(Array.isArray(p.images)?p.images:[]);navigate('create');
  }catch(e){fail(e)}}
  async function downloadProject(p:Project){try{
    if(p.current_html){downloadHTML(p);return}
    const data=await api<{project:Project}>(`/api/projects/${p.id}`);downloadHTML(data.project);
  }catch(e){fail(e)}}
  async function deleteProject(p:Project){if(!confirm(`Supprimer le projet « ${p.name} » et toutes ses versions ?`))return;
    try{await api('/api/projects',{method:'DELETE',body:JSON.stringify({id:p.id})});setProjects(ps=>ps.filter(x=>x.id!==p.id));if(activeProjectId===p.id){setActiveProjectId(null);setSelectedProject(null)}inform('Projet supprimé.')}catch(e){fail(e)}
  }
  async function saveSettings(){setSaving(true);try{
    await api('/api/settings',{method:'PATCH',body:JSON.stringify(settings)});setMatrixDirty(false);inform('Paramètres enregistrés.');
  }catch(e){fail(e)}finally{setSaving(false)}}
  async function logout(){try{await api('/api/auth/logout',{method:'POST'});window.location.href='/'}catch(e){fail(e)}}

  return <div className="workspace">
    {sidebar&&<button className="sidebar-scrim" aria-label="Fermer le menu" onClick={()=>setSidebar(false)}/>}
    <aside className={'sidebar '+(sidebar?'sidebar-open':'')}>
      <div className="sidebar-brand"><div className="logo-mark">H<span>.</span></div><div><strong>HARMONY</strong><small>STUDIO</small></div></div>
      <div className="sidebar-inner"><div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav">{nav.map(item=><button key={item.id} className={'nav-item '+(view===item.id?'active':'')} onClick={()=>navigate(item.id)}><item.icon size={18} strokeWidth={view===item.id?2.3:1.8}/><span>{item.label}</span>{view===item.id&&<span className="nav-dot"/>}</button>)}</nav>
        <div className="sidebar-divider"/><div className="sidebar-label">RACCOURCIS</div>
        <button className="nav-item" onClick={()=>navigate('prospects')}><Radar size={18}/><span>Chercher des clients</span></button>
        <button className="nav-item" onClick={newProject}><Plus size={18}/><span>Nouveau projet</span></button>
      </div>
      <div className="sidebar-bottom"><div className="sidebar-subscription"><div className="sub-spark"><Sparkles size={16}/></div><div><strong>Ton studio privé</strong><small>Propulsé par Claude AI</small></div></div>
        <button className="profile" onClick={logout}><span className="avatar">S</span><span className="profile-label"><strong>Salim</strong><small>Administrateur</small></span><LogOut size={17}/></button></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setSidebar(!sidebar)}>☰</button><div className="breadcrumb"><span>Harmony Studio</span><ChevronRight size={14}/><strong>{nav.find(n=>n.id===view)?.label}</strong></div><div className="topbar-end"><span className="secure-pill"><span/> Espace privé</span><span className="today-pill">{new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(new Date())}</span><span className="tiny-avatar">S</span></div></header>
      <main className="content">
        {notice&&<div className="toast success"><CheckCircle2 size={17}/>{notice}<button aria-label="Fermer" onClick={()=>setNotice('')}><X size={15}/></button></div>}
        {error&&<div className="toast error"><CircleAlert size={17}/>{error}<button aria-label="Fermer" onClick={()=>setError('')}><X size={15}/></button></div>}
        {view==='home'&&<>
          <Heading overline="TABLEAU DE BORD / 01" title="Bonjour Salim 👋" description="Voici ton activité Harmony Solutions, au même endroit." action={<button className="btn primary" onClick={newProject}><Plus size={17}/> Créer un site</button>}/>
          <div className="welcome-banner"><div><span className="banner-kicker"><Sparkles size={15}/> TON STUDIO DE CROISSANCE</span><h2>De la découverte d'un client<br/>à son prochain site web.</h2><p>Repère les opportunités. Transforme tes idées en créations concrètes. Un espace, zéro dispersion.</p><button onClick={()=>navigate('prospects')}>Lancer la prospection <ArrowRight size={17}/></button></div><div className="banner-decoration"><div className="decoration-ring ring1"/><div className="decoration-ring ring2"/><div className="floating-tile"><WandSparkles size={34}/></div></div></div>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-top"><span>Prospects identifiés</span><div className="stat-icon coral"><Users size={19}/></div></div><strong>{loading?'—':stats.total}</strong><small>Toutes les pistes enregistrées</small></div>
            <div className="stat-card"><div className="stat-top"><span>Signaux prioritaires</span><div className="stat-icon amber"><Target size={19}/></div></div><strong>{loading?'—':stats.hot}</strong><small>Score automatique ≥ 70/100</small></div>
            <div className="stat-card"><div className="stat-top"><span>Prospection en cours</span><div className="stat-icon blue"><BriefcaseBusiness size={19}/></div></div><strong>{loading?'—':stats.active}</strong><small>Contactés, relances et devis</small></div>
            <div className="stat-card"><div className="stat-top"><span>Sites générés</span><div className="stat-icon purple"><Layers3 size={19}/></div></div><strong>{loading?'—':projects.length}</strong><small>Projets dans ton studio</small></div>
          </div>
          <div className="home-panels"><Panel><div className="panel-header"><div><h3>Derniers prospects</h3><p>Les pistes les plus récemment découvertes</p></div><button className="text-action" onClick={()=>navigate('prospects')}>Voir tout <ArrowUpRight size={16}/></button></div>{prospects.length?prospects.slice(0,4).map(p=><button key={p.id} className="recent-row" onClick={()=>{editProspect(p);navigate('prospects')}}><div className="company-avatar">{p.name.slice(0,1).toUpperCase()}</div><div className="recent-main"><strong>{p.name}</strong><small>{p.city||'Web'} · {p.category}</small></div><span className={'score '+(p.score>=70?'high':'')}>{p.score}/100</span><ChevronRight size={16}/></button>):<Empty icon={Search} title="Aucun prospect pour le moment" description="Lance une recherche pour découvrir tes premières opportunités."/>}</Panel>
            <Panel><div className="panel-header"><div><h3>Ton espace de création</h3><p>Transforme une idée en site internet</p></div><div className="stat-icon purple"><WandSparkles size={19}/></div></div><div className="quick-create"><div className="quick-illustration"><div className="mini-browser"><div className="mini-dots"><i/><i/><i/></div><div className="mini-hero"/><div className="mini-lines"><span/><span/></div><div className="mini-cards"><i/><i/><i/></div></div><div className="quick-spark"><Sparkles size={22}/></div></div><h4>Une idée. Quelques photos.<br/>Un site à ton image.</h4><p>Claude génère une page HTML personnalisée depuis ta matrice.</p><button className="btn primary full" onClick={newProject}>Ouvrir le studio IA <ArrowRight size={16}/></button></div></Panel></div>
        </>}
        {view==='prospects'&&<>
          <Heading overline="PROSPECTION / 02" title="Trouve tes futurs clients." description="Recherche des demandes publiques et constitue ton portefeuille commercial." action={<button className="btn secondary" onClick={()=>setAddOpen(true)}><Plus size={17}/> Ajouter manuellement</button>}/>
          <Panel className="search-panel"><div className="search-panel-top"><div className="search-panel-heading"><div className="feature-icon"><Radar size={22}/></div><div><h3>Recherche d'opportunités</h3><p>Résultats issus d'une recherche web, à qualifier avant démarchage.</p></div></div><span className="api-tag"><Zap size={14}/> BRAVE SEARCH</span></div>
            <div className="mode-tabs"><button className={searchMode==='demandes'?'selected':''} onClick={()=>setSearchMode('demandes')}><Target size={16}/> Demandes de sites</button><button className={searchMode==='commerces'?'selected':''} onClick={()=>setSearchMode('commerces')}><Globe2 size={16}/> Commerces locaux</button><button className={searchMode==='logiciels'?'selected':''} onClick={()=>setSearchMode('logiciels')}><Layers3 size={16}/> Logiciels & ERP</button></div>
            <div className="search-fields"><div className="field"><label><MapPin size={14}/> Ville, zone ou département</label><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Oise, Creil, Paris..." maxLength={90}/></div><div className="field custom-search"><label>Recherche précise (optionnel)</label><input value={customQuery} onChange={e=>setCustomQuery(e.target.value)} placeholder="Ex. cherche prestataire site boulangerie..." maxLength={250}/></div><button className="btn primary search-submit" onClick={searchProspects} disabled={searching}>{searching?<RefreshCw size={17} className="spinning"/>:<Search size={17}/>} {searching?'Recherche...':'Lancer la recherche'}</button></div>
            <div className="search-note"><Info size={15}/> Une entreprise trouvée n'a pas forcément besoin d'un site : les scores sont des indicateurs et non des besoins confirmés.</div>
          </Panel>
          <div className="leads-title"><div><h2>Portefeuille prospects <span>{prospects.length}</span></h2><p>Identifie, contacte et suis tes opportunités</p></div><div className="toolbar-actions"><button className="btn secondary" onClick={()=>exportCSV(filtered)}><FileDown size={16}/> Exporter CSV</button><button className="btn ghost" onClick={async()=>{try{const d=await api<{prospects:Prospect[]}>('/api/prospects');setProspects(d.prospects);inform('Liste actualisée.')}catch(e){fail(e)}}}><RefreshCw size={16}/> Actualiser</button></div></div>
          <div className="leads-toolbar"><div className="lead-filters"><button className={filter==='Tous'?'picked':''} onClick={()=>setFilter('Tous')}>Tous</button>{['Nouveau','À contacter','Contacté','Devis','Gagné'].map(s=><button className={filter===s?'picked':''} onClick={()=>setFilter(s)} key={s}>{s}</button>)}</div><div className="lead-search"><Search size={17}/><input placeholder="Filtrer les prospects..." value={keyword} onChange={e=>setKeyword(e.target.value)}/></div></div>
          <Panel className="leads-list">{filtered.length?filtered.map(p=><div className="lead-card" key={p.id}><div className="lead-avatar">{p.name.charAt(0).toUpperCase()}</div><div className="lead-info"><div className="lead-name-line"><strong>{p.name}</strong><span className={'signal '+(p.score>=70?'strong':'')}>{p.signal}</span></div><p>{p.evidence||'Aucun extrait disponible — consulter la source pour confirmer.'}</p><div className="lead-meta"><span><MapPin size={13}/>{p.city||'Web'}</span><span><Layers3 size={13}/>{p.category}</span><span><Clock3 size={13}/>{new Date(p.created_at).toLocaleDateString('fr-FR')}</span></div></div><div className="lead-right"><span className={'score '+(p.score>=70?'high':'')}>{p.score}/100</span><span className="status-pill">{p.status}</span><div className="lead-actions"><button title="Ouvrir la source" onClick={()=>window.open(p.source_url,'_blank','noopener,noreferrer')}><ExternalLink size={16}/></button><button title="Modifier la fiche" onClick={()=>editProspect(p)}><Pencil size={16}/></button></div></div></div>):<Empty icon={SlidersHorizontal} title="Aucune piste dans cette liste" description="Change le filtre ou lance une nouvelle recherche."/>}</Panel>
        </>}
        {view==='create'&&<>
          <Heading overline="STUDIO IA / 03" title={activeProjectId?'Développe ta création.':'Donne vie à tes idées.'} description="Ton assistant Claude transforme tes références en un site web personnalisable." action={<button className="btn secondary" onClick={newProject}><Plus size={17}/> Nouveau projet</button>}/>
          <div className="studio-grid"><div className="studio-left"><Panel className="studio-form"><div className="form-section-title"><span className="step-number">01</span><div><h3>Le projet</h3><p>Raconte l'essentiel de ton besoin</p></div></div>
            <div className="field"><label>Nom du projet *</label><input placeholder="Ex. Maison Artisanale, Noa Café..." value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div className="field"><label>Type de création</label><div className="input-with-arrow"><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{categories.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={17}/></div></div>
            <div className="field"><label>Direction artistique</label><div className="input-with-arrow"><select value={form.style} onChange={e=>setForm(f=>({...f,style:e.target.value}))}>{styles.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={17}/></div></div>
            <div className="field"><label>Description et objectifs *</label><textarea rows={5} placeholder="Décris l'activité, les pages souhaitées, les couleurs, les services, les fonctionnalités, les coordonnées réelles..." value={form.brief} onChange={e=>setForm(f=>({...f,brief:e.target.value}))}/></div>
            <div className="form-section-title section-spaced"><span className="step-number">02</span><div><h3>Références visuelles</h3><p>Ajoute les photos que Claude doit utiliser</p></div></div>
            <label className={'upload-zone '+(uploading?'upload-busy':'')}><input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={uploading||images.length>=6} onChange={e=>{void uploadFiles(e.target.files);e.target.value=''}}/><div className="upload-icon"><ImagePlus size={23}/></div><strong>{uploading?'Transfert des images...':'Cliquer pour ajouter des photos'}</strong><span>JPG, PNG, WEBP • Max. 15 Mo/photo • {images.length}/6</span></label>
            {!!images.length&&<div className="image-strip">{images.map((u,i)=><div className="image-thumb" key={u}><img src={u} alt={`Photo de référence ${i+1}`}/><button aria-label="Retirer la photo" onClick={()=>setImages(xs=>xs.filter(x=>x!==u))}><X size={13}/></button></div>)}</div>}
            {activeProjectId&&<div className="field section-spaced"><label>Modifications souhaitées</label><textarea rows={3} value={form.instructions} onChange={e=>setForm(f=>({...f,instructions:e.target.value}))} placeholder="Ex. Agrandis le hero, remplace la palette par terracotta, ajoute une galerie..."/></div>}
            <div className="matrix-info"><Sparkles size={17}/><span>La matrice de génération est modifiable dans <button onClick={()=>navigate('settings')}>Paramètres</button>.</span></div>
            <button className="btn primary full generate-btn" disabled={generating||uploading} onClick={generate}>{generating?<RefreshCw size={18} className="spinning"/>:<WandSparkles size={18}/>} {generating?'Claude construit ton site...':activeProjectId?'Régénérer cette version':'Générer mon site'} <ArrowRight size={17}/></button><p className="cost-note">Chaque génération utilise ton compte API Claude et peut être facturée selon ton offre.</p>
            </Panel></div>
            <div className="studio-right"><Panel className="preview-panel"><div className="preview-header"><div><h3>Aperçu en direct</h3><p>{selectedProject?.name || 'Ton futur site s’affichera ici'}</p></div><div className="preview-toolbar"><div className="device-toggle"><button title="Ordinateur" className={previewMode==='desktop'?'picked':''} onClick={()=>setPreviewMode('desktop')}><Monitor size={17}/></button><button title="Mobile" className={previewMode==='mobile'?'picked':''} onClick={()=>setPreviewMode('mobile')}><Smartphone size={17}/></button></div>{selectedProject&&<button className="icon-button" title="Exporter le HTML" onClick={()=>{void downloadProject(selectedProject)}}><FileDown size={17}/></button>}</div></div>
            <div className={'preview-canvas '+(previewMode==='mobile'?'is-mobile':'')}>
              {selectedProject?.current_html?<div className={'render-frame '+(previewMode==='mobile'?'render-mobile':'')}><iframe title="Aperçu sécurisé du site généré" srcDoc={buildPreview(selectedProject.current_html)} sandbox="allow-scripts" referrerPolicy="no-referrer"/></div>:<div className="preview-placeholder"><div className="preview-placeholder-icon"><Globe2 size={35}/></div><h3>Un nouveau site prend forme ici.</h3><p>Remplis le brief, sélectionne tes images et lance Claude pour voir le résultat.</p><div className="preview-placeholders"><span/><span/><span/></div></div>}
            </div>{selectedProject&&<div className="preview-caption"><div><CheckCircle2 size={16}/><span>{selectedProject.summary}</span></div><button className="btn secondary" onClick={()=>{void downloadProject(selectedProject)}}><FileDown size={16}/> Exporter HTML</button></div>}</Panel>
            <div className="studio-tip"><ShieldCheck size={18}/><span>La prévisualisation fonctionne dans une iframe isolée. Le HTML exporté est une base statique : une boutique, un paiement ou un ERP réclameront ensuite un véritable backend sécurisé.</span></div>
            </div></div>
        </>}
        {view==='projects'&&<><Heading overline="BIBLIOTHÈQUE / 04" title="Toutes tes créations." description="Retrouve tes sites générés, améliore-les et exporte-les." action={<button className="btn primary" onClick={newProject}><Plus size={17}/> Nouveau site</button>}/>
          {projects.length?<div className="project-grid">{projects.map(p=><Panel className="project-card" key={p.id}><div className="project-cover"><div className="project-cover-browser"><div className="mini-dots"><i/><i/><i/></div><div className="project-cover-gradient"><Globe2 size={35}/></div></div></div><div className="project-body"><div className="project-type">{p.category}</div><h3>{p.name}</h3><p>{p.summary||p.brief}</p><small><Clock3 size={13}/> Mis à jour le {new Date(p.updated_at).toLocaleDateString('fr-FR')}</small><div className="project-actions"><button className="btn secondary" onClick={()=>openProject(p)}><Pencil size={15}/> Modifier</button><button className="icon-button" title="Télécharger le site" onClick={()=>{void downloadProject(p)}}><FileDown size={16}/></button><button className="icon-button danger" title="Supprimer" onClick={()=>deleteProject(p)}><Trash2 size={16}/></button></div></div></Panel>)}</div>:<Panel><Empty icon={FolderKanban} title="Ta bibliothèque attend ses premiers projets" description="Crée ton premier site avec le Studio IA."/><div className="empty-cta"><button className="btn primary" onClick={newProject}>Créer mon premier site <ArrowRight size={16}/></button></div></Panel>}
        </>}
        {view==='settings'&&<><Heading overline="CONFIGURATION / 05" title="Les réglages de ton studio." description="Personnalise la matrice créative et le fonctionnement de ta veille." action={<button className="btn primary" onClick={saveSettings} disabled={saving}><Save size={17}/>{saving?'Enregistrement...':'Enregistrer'}</button>}/>
          <div className="settings-grid"><Panel><div className="settings-heading"><div className="feature-icon"><WandSparkles size={21}/></div><div><h3>Ta matrice de création</h3><p>Le prompt maître qui gouverne chaque génération Claude.</p></div></div><div className="field"><label>DIRECTIVES PERMANENTES</label><textarea className="matrix-textarea" value={settings.matrix} onChange={e=>{setSettings(s=>({...s,matrix:e.target.value}));setMatrixDirty(true)}} rows={21} spellCheck={false}/></div><div className="helper-line"><Info size={15}/> Colle ici ton prompt habituel quand tu me l'auras envoyé. {matrixDirty&&<b>Modifications non sauvegardées.</b>}</div></Panel>
          <div className="settings-side"><Panel><div className="settings-heading"><div className="feature-icon"><Radar size={21}/></div><div><h3>Veille automatisée</h3><p>Des recherches quotidiennes de demandes publiques.</p></div></div><div className="field"><label>Zone surveillée</label><input value={settings.watch_city} onChange={e=>setSettings(s=>({...s,watch_city:e.target.value}))}/></div><label className="switch-row"><div><strong>Activer la veille</strong><small>Une recherche par jour à 7 h UTC (heure approximative selon le forfait Vercel).</small></div><input type="checkbox" checked={settings.watch_enabled} onChange={e=>setSettings(s=>({...s,watch_enabled:e.target.checked}))}/><span className="switch-track"/></label><div className="search-note"><Info size={15}/> La veille nécessite BRAVE_SEARCH_API_KEY et CRON_SECRET. Enregistre tes réglages pour les appliquer.</div></Panel>
          <Panel><div className="settings-heading"><div className="feature-icon"><ShieldCheck size={21}/></div><div><h3>Accès et confidentialité</h3><p>Un espace conçu pour un administrateur unique.</p></div></div><div className="security-row"><Check size={16}/> Aucune inscription publique</div><div className="security-row"><Check size={16}/> Mot de passe haché et cookie sécurisé</div><div className="security-row"><Check size={16}/> Données commerciales dans Neon</div><div className="security-row"><Info size={16}/> Photos stockées dans un Blob public non indexé : tout détenteur de l'URL peut les consulter.</div><div className="security-row"><Info size={16}/> Clés API stockées côté serveur uniquement.</div></Panel></div></div>
        </>}
      </main>
      <footer className="app-footer"><span>© 2026 Harmony Solutions</span><span>Crafted for Salim · Powered by AI</span></footer>
    </div>
    {(editing||addOpen)&&<div className="modal-backdrop" onMouseDown={()=>{setEditing(null);setAddOpen(false)}}><div className="modal" onMouseDown={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={editing?'Éditer un prospect':'Ajouter un prospect'}><div className="modal-header"><div><div className="eyebrow">GESTION COMMERCIALE</div><h2>{editing?'Fiche prospect':'Ajouter un prospect'}</h2></div><button className="icon-button" onClick={()=>{setEditing(null);setAddOpen(false)}}><X size={20}/></button></div>
      {editing?<div className="modal-body"><h3>{editing.name}</h3><p className="modal-evidence">{editing.evidence||'Aucune information confirmée.'}</p><a href={editing.source_url} target="_blank" rel="noopener noreferrer" className="source-link">Ouvrir l'annonce ou le résultat <ExternalLink size={14}/></a><div className="field"><label>Statut de prospection</label><select value={editStatus} onChange={e=>setEditStatus(e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div><div className="field"><label>Notes personnelles / suivi</label><textarea rows={5} value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="Personne à joindre, date d'appel, devis, relance..."/></div><div className="draft-box"><div><strong>Message de prospection</strong><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(draft);inform('Message copié — à vérifier avant envoi.')}catch{fail(new Error('Impossible de copier le message.'))}}}><Copy size={14}/> Copier</button></div><textarea rows={7} value={draft} onChange={e=>setDraft(e.target.value)}/><p>Aucun message n'est envoyé automatiquement. Le texte reste modifiable avant envoi.</p></div><div className="modal-actions"><button className="btn ghost danger-text" onClick={()=>deleteProspect(editing)}><Trash2 size={16}/> Supprimer</button><button className="btn primary" disabled={saving} onClick={saveProspect}><Save size={16}/> Enregistrer</button></div></div>
      :<div className="modal-body"><div className="field"><label>Nom de l'entreprise *</label><input value={addForm.name} onChange={e=>setAddForm(s=>({...s,name:e.target.value}))}/></div><div className="field"><label>Lien du prospect / annonce *</label><input placeholder="https://..." value={addForm.source_url} onChange={e=>setAddForm(s=>({...s,source_url:e.target.value}))}/></div><div className="field"><label>Ville</label><input value={addForm.city} onChange={e=>setAddForm(s=>({...s,city:e.target.value}))}/></div><div className="field"><label>Type de prestation</label><select value={addForm.category} onChange={e=>setAddForm(s=>({...s,category:e.target.value}))}>{categories.map(c=><option key={c}>{c}</option>)}</select></div><div className="field"><label>Notes</label><textarea rows={3} value={addForm.notes} onChange={e=>setAddForm(s=>({...s,notes:e.target.value}))}/></div><div className="modal-actions"><button className="btn secondary" onClick={()=>setAddOpen(false)}>Annuler</button><button className="btn primary" disabled={saving} onClick={addProspect}><Plus size={16}/> Ajouter</button></div></div>}
      </div></div>}
  </div>;
}
