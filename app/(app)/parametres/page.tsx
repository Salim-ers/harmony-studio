import type { Metadata } from 'next';
import { Suspense } from 'react';
import Parametres from '@/components/pages/Parametres';

export const metadata: Metadata = { title: 'Paramètres' };
export default function Page() {
  return <Suspense><Parametres /></Suspense>;
}
