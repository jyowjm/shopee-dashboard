import CenteredCard from '@/components/CenteredCard';

export default function ConnectPage() {
  return (
    <CenteredCard maxWidth="max-w-lg">
      <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg
          className="w-8 h-8 text-orange-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Connect your shops</h1>
      <p className="text-gray-500 mb-8 leading-relaxed">
        Authorize your seller accounts to start pulling in your sales data. You can connect one or
        both platforms.
      </p>

      <div className="flex flex-col gap-4">
        <a
          href="/api/auth/connect"
          className="inline-flex items-center justify-center gap-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
        >
          {/* Shopee icon */}
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 1.74.63 3.33 1.67 4.56L5.5 22h13l-1.17-8.44A6.96 6.96 0 0 0 19 9c0-3.87-3.13-7-7-7zm0 2c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5z" />
          </svg>
          Connect Shopee
        </a>

        <a
          href="/api/auth/tiktok/connect"
          className="inline-flex items-center justify-center gap-3 bg-gray-900 hover:bg-black text-white font-semibold px-8 py-3 rounded-lg transition-colors"
        >
          {/* TikTok icon */}
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.19 8.19 0 0 0 4.79 1.52V6.78a4.85 4.85 0 0 1-1.02-.09z" />
          </svg>
          Connect TikTok Shop
        </a>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        You can connect additional platforms later from Settings.
      </p>
    </CenteredCard>
  );
}
