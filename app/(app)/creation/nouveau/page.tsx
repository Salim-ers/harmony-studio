import type { Metadata } from 'next';
import { Suspense } from 'react';
import NouveauProjet from '@/components/pages/NouveauProjet';

export const metadata: Metadata = { title: 'Nouveau projet' };
export default function Page() {
  return <Suspense><NouveauProjet /></Suspense>;
}
