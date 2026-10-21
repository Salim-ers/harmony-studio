import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Dashboard from '@/components/Dashboard';
export const dynamic='force-dynamic';
export default async function DashboardPage(){if(!(await isAuthenticated()))redirect('/');return <Dashboard/>}
