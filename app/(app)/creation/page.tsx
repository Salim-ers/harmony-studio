import type { Metadata } from 'next';
import Projets from '@/components/pages/Projets';

export const metadata: Metadata = { title: 'Projets' };
export default function Page() {
  return <Projets />;
}
