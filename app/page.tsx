import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/auth';
import { env } from '@/lib/server/env';
import Login from '@/components/Login';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  let session = null;
  let configError = '';
  try { session = await getSession(); } catch (e) { configError = e instanceof Error && /DATABASE_URL|SESSION_SECRET/.test(e.message) ? e.message : ''; }
  const { suite } = await searchParams;
  const next = suite && /^\/[a-z0-9/_-]*$/i.test(suite) && !suite.startsWith('//') ? suite : '/dashboard';
  if (session) redirect(next);
  return <Login totp={env.totpSecret().length >= 16} next={next} configError={configError} />;
}
