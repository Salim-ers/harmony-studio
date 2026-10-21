import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Studio from '@/components/studio/Studio';
import { UUID_RE } from '@/lib/server/db';

export const metadata: Metadata = { title: 'Studio' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return <Studio id={id} />;
}
