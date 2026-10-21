import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title:'Harmony Studio — Espace privé',description:'Pilotage de la prospection et création web par IA — Harmony Solutions',
  robots:{index:false,follow:false,noarchive:true}
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="fr"><body>{children}</body></html>;
}
