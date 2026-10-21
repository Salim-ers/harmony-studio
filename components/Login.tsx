'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
export default function Login(){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json();if(!r.ok)throw new Error(j.error);window.location.href='/dashboard'}
    catch(e){setError(e instanceof Error?e.message:'Erreur de connexion')}finally{setBusy(false)}
  }
  return <main className="login-page"><div className="login-orb login-orb-one"/><div className="login-orb login-orb-two"/>
    <div className="login-shell"><div className="login-brand"><div className="logo-mark">H<span>.</span></div><div><b>HARMONY</b><small>STUDIO / BY HARMONY SOLUTIONS</small></div></div>
      <div className="login-grid"><section className="login-message"><span className="eyebrow light"><Sparkles size={14}/> TON ESPACE DE TRAVAIL</span><h1>Tout ton business.<br/><em>Un seul endroit.</em></h1><p>Détecte les opportunités, développe ton portefeuille client et donne vie à tes sites avec l'intelligence artificielle.</p><div className="login-facts"><span>01 / Prospection</span><span>02 / Création IA</span><span>03 / Gestion privée</span></div></section>
      <section className="login-card"><div className="login-card-icon"><LockKeyhole size={22}/></div><div className="login-title">Bienvenue, Salim.</div><p>Accède à ton espace administrateur.</p><form onSubmit={submit}><label>ADRESSE E-MAIL</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@harmonysolutions.fr" required autoComplete="username"/><label>MOT DE PASSE</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••••" required autoComplete="current-password"/>{error&&<div className="form-error">{error}</div>}<button type="submit" className="btn primary full" disabled={busy}>{busy?'Vérification...':'Accéder à mon espace'}<ArrowRight size={17}/></button></form><div className="login-foot"><ShieldCheck size={15}/> Accès personnel et sécurisé</div></section></div>
    <div className="login-copyright">© 2026 HARMONY SOLUTIONS — PRIVATE WORKSPACE</div></div></main>
}
