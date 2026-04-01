import { redirect } from 'next/navigation';
import { loadTokens } from '@/lib/kv';
import Dashboard from '@/components/Dashboard';

export default async function Home() {
  const tokens = await loadTokens();
  if (!tokens) {
    redirect('/connect');
  }
  return <Dashboard />;
}
