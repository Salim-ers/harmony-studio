import type { Metadata } from 'next';
import { Suspense } from 'react';
import Prospection from '@/components/pages/Prospection';

export const metadata: Metadata = { title: 'Opportunités' };
export default function Page() {
  return <Suspense><Prospection /></Suspense>;
}
