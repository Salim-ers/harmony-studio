'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/client/api';

export default function Login({ totp, next, configError }: { totp: boolean; next: string; configError: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(configError);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { json: { email, password, code } });
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }
  const words = ['Trouvez', 'vos', 'clients.'];
  return (
    <main className="login">
      <section className="login-art">
        <div className="login-lines" />
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark" aria-hidden="true">H</div>
          <div><div className="brand-name">HARMONY</div><div className="brand-sub">STUDIO · HARMONY SOLUTIONS</div></div>
        </div>
        <div>
          <h1 className="login-title login-reveal">
            {words.map((w, i) => <span key={w} style={{ animationDelay: `${0.1 + i * 0.12}s` }}>{w}&nbsp;</span>)}<br />
            <span style={{ animationDelay: '.5s' }}><em>Créez</em>&nbsp;</span><span style={{ animationDelay: '.62s' }}>leurs&nbsp;</span><span style={{ animationDelay: '.74s' }}>sites.</span>
          </h1>
          <p style={{ color: '#aab6cc', maxWidth: 460, marginTop: 18, fontSize: 15 }}>Prospection sourcée et vérifiable, CRM, devis et création de sites premium avec Claude — dans un espace réservé à vous seul.</p>
        </div>
        <div className="row tiny" style={{ color: '#7f8ca6', gap: 18 }}><span>Des idées d’aujourd’hui pour vos projets de demain</span></div>
      </section>
      <section className="login-panel">
        <form className="login-card stack" onSubmit={submit} noValidate>
          <div className="kpi-icon" style={{ width: 44, height: 44, borderRadius: 12 }}><LockKeyhole size={20} /></div>
          <div><h2>Bienvenue.</h2><p className="muted">Connectez-vous à votre espace privé.</p></div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="field"><label htmlFor="email">Adresse e-mail</label><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="password">Mot de passe</label><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {totp ? <div className="field"><label htmlFor="code"><KeyRound size={14} />Code de double authentification</label><input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div> : null}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>{busy ? <Loader2 size={17} className="spin" /> : null}Accéder à mon espace<ArrowRight size={17} /></button>
          <p className="tiny muted row" style={{ justifyContent: 'center' }}><ShieldCheck size={14} />Accès personnel — tentatives limitées et journalisées</p>
        </form>
      </section>
    </main>
  );
}
