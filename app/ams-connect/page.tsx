import { loadAmsTokens } from '@/lib/kv'

export default async function AmsConnectPage() {
  const tokens = await loadAmsTokens()
  const isConnected = !!tokens

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 max-w-md w-full text-center">

        {/* Icon */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${isConnected ? 'bg-green-100' : 'bg-orange-100'}`}>
          {isConnected ? (
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          )}
        </div>

        {isConnected ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">AMS App Connected</h1>
            <p className="text-gray-500 mb-2 leading-relaxed">
              Your Affiliate Marketing Solution Management app is authorized and ready.
            </p>
            <p className="text-sm text-gray-400 mb-8">
              Shop ID: {tokens.shop_id} &nbsp;·&nbsp; Token expires: {new Date(tokens.expires_at).toLocaleString('en-MY')}
            </p>
            <a
              href="/api/ams-auth/connect"
              className="inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Re-authorize
            </a>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Connect AMS App</h1>
            <p className="text-gray-500 mb-2 leading-relaxed">
              Authorize the Affiliate Marketing Solution Management app to access your AMS conversion report data.
            </p>
            <p className="text-sm text-gray-400 mb-8">
              This is used to independently verify your Shopee AMS commission fees.
            </p>
            <a
              href="/api/ams-auth/connect"
              className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Authorize AMS App
            </a>
          </>
        )}
      </div>
    </div>
  )
}
