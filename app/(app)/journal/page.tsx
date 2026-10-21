import type { Metadata } from 'next';
import Journal from '@/components/pages/Journal';

export const metadata: Metadata = { title: 'Journal & coûts' };
export default function Page() {
  return <Journal />;
}
