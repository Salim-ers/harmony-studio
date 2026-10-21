import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/auth';
import { mocksEnabled } from '@/lib/server/env';
import AppShell from '@/components/AppShell';

export const dynamic = 'force-dynamic';

/** Toutes les pages privées : session vérifiée en base, côté serveur, à chaque requête. */
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  let session = null;
  try { session = await getSession(); } catch { session = null; }
  if (!session) redirect('/');
  return <AppShell demo={mocksEnabled()}>{children}</AppShell>;
}
