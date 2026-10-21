import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/inter';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Harmony Studio', template: '%s — Harmony Studio' },
  description: 'Espace privé de prospection et de création IA — Harmony Solutions',
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { themeColor: '#0c1a33', width: 'device-width', initialScale: 1 };

// Applique le thème mémorisé avant le premier affichage (évite le flash). Chaîne constante, aucune donnée externe.
const THEME_SCRIPT = `try{var t=localStorage.getItem('hs:theme');if(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(t==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
