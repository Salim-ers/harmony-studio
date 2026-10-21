import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProspectDetail from '@/components/pages/ProspectDetail';
import { UUID_RE } from '@/lib/server/db';

export const metadata: Metadata = { title: 'Fiche prospect' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return <ProspectDetail id={id} />;
}
