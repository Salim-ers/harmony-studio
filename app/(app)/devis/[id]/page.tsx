import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import DevisEditor from '@/components/pages/DevisEditor';
import { UUID_RE } from '@/lib/server/db';

export const metadata: Metadata = { title: 'Devis' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== 'nouveau' && !UUID_RE.test(id)) notFound();
  return <Suspense><DevisEditor id={id === 'nouveau' ? null : id} /></Suspense>;
}
