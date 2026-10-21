import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Login from '@/components/Login';
export default async function Home(){if(await isAuthenticated())redirect('/dashboard');return <Login/>}
