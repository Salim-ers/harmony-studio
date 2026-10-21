import type { Metadata } from 'next';
import DevisList from '@/components/pages/DevisList';

export const metadata: Metadata = { title: 'Devis' };
export default function Page() {
  return <DevisList />;
}
