import type { Metadata } from 'next';
import Dashboard from '@/components/pages/Dashboard';

export const metadata: Metadata = { title: 'Tableau de bord' };
export default function Page() {
  return <Dashboard />;
}
