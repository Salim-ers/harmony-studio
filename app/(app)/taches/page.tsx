import type { Metadata } from 'next';
import Taches from '@/components/pages/Taches';

export const metadata: Metadata = { title: 'Tâches & relances' };
export default function Page() {
  return <Taches />;
}
