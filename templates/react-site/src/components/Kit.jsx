/**
 * Composants utilitaires du kit Harmony (non générés par l'IA) :
 * Seo, Missing, NotConfigured, ContactForm, CallButton.
 */
import { useState } from 'react';
import site from '../site.config.js';

/** Titre et description propres à chaque page (React 19 les place automatiquement dans <head>). */
export function Seo({ title, description, image }) {
  const full = title ? `${title} — ${site.name}` : site.name;
  return (
    <>
      <title>{full}</title>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={full} />
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:type" content="website" />
      {image ? <meta property="og:image" content={image} /> : null}
    </>
  );
}

const isMissing = (v) => v === null || v === undefined || v === '' || v === 'À renseigner';

/** Affiche la valeur, ou un repère visible « À renseigner » si elle n'est pas confirmée. */
export function Missing({ value, label = 'À renseigner', children }) {
  if (isMissing(value)) return <span className="a-renseigner">{label}</span>;
  return children ?? <>{value}</>;
}

export function NotConfigured({ children = 'Ce service n’est pas encore configuré.' }) {
  return <p className="hs-not-configured" role="note">{children}</p>;
}

/**
 * Bouton d'appel direct (mobile). N'apparaît que si un téléphone CONFIRMÉ existe dans site.config.js.
 */
export function CallButton({ className = 'btn btn-primary', children = 'Appeler' }) {
  if (isMissing(site.contact?.phone)) return null;
  return <a className={className} href={`tel:${String(site.contact.phone).replace(/[^\d+]/g, '')}`}>{children}</a>;
}

/**
 * Formulaire de contact HONNÊTE : sans service d'envoi configuré, il prépare un e-mail dans la
 * messagerie du visiteur (mailto) vers l'adresse confirmée. Sans e-mail confirmé, il l'indique.
 * Il ne prétend jamais avoir envoyé un message.
 */
export function ContactForm({ subjectPrefix = 'Demande depuis le site', fields = ['nom', 'email', 'telephone', 'message'] }) {
  const email = site.contact?.email;
  const [values, setValues] = useState({});
  const [opened, setOpened] = useState(false);
  if (isMissing(email)) {
    return <NotConfigured>Formulaire non encore relié : contactez-nous par téléphone en attendant la mise en service.</NotConfigured>;
  }
  const labels = { nom: 'Nom', email: 'E-mail', telephone: 'Téléphone', message: 'Votre message', sujet: 'Sujet' };
  const submit = (e) => {
    e.preventDefault();
    const body = fields.map((f) => `${labels[f] ?? f} : ${values[f] ?? ''}`).join('\n');
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(`${subjectPrefix}${values.sujet ? ' — ' + values.sujet : ''}`)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };
  return (
    <form className="hs-form" onSubmit={submit} noValidate={false}>
      {fields.map((f) => (
        <label key={f} className="hs-field">
          <span>{labels[f] ?? f}</span>
          {f === 'message' ? (
            <textarea name={f} rows={5} required onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
          ) : (
            <input name={f} type={f === 'email' ? 'email' : f === 'telephone' ? 'tel' : 'text'} required={f !== 'telephone'} autoComplete={f === 'nom' ? 'name' : f === 'email' ? 'email' : f === 'telephone' ? 'tel' : 'off'} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
          )}
        </label>
      ))}
      <button className="btn btn-primary" type="submit">Préparer l’e-mail</button>
      <p className="hs-form-note">Ce formulaire ouvre votre messagerie avec un message pré-rempli vers {email}. {opened ? 'Pensez à cliquer sur « Envoyer » dans votre messagerie.' : ''}</p>
    </form>
  );
}
