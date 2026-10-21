import type { Metadata } from 'next';
import Recherches from '@/components/pages/Recherches';

export const metadata: Metadata = { title: 'Recherches & veille' };
export default function Page() {
  return <Recherches />;
}
