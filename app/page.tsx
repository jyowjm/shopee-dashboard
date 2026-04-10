import { redirect } from 'next/navigation';
import { loadTokens, loadTikTokTokens } from '@/lib/kv';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [shopeeTokens, tikTokTokens] = await Promise.all([
    loadTokens(),
    loadTikTokTokens(),
  ]);

  if (!shopeeTokens && !tikTokTokens) {
    redirect('/connect');
  }

  return (
    <Dashboard
      hasShopee={!!shopeeTokens}
      hasTikTok={!!tikTokTokens}
    />
  );
}
