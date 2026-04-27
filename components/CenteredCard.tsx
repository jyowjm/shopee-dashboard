import type { ReactNode } from 'react';

/**
 * Centered card on a gray background — the chrome shared by /connect and /ams-connect.
 */
export default function CenteredCard({
  children,
  maxWidth = 'max-w-md',
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div
        className={`bg-white rounded-xl shadow-sm border border-gray-200 p-12 ${maxWidth} w-full text-center`}
      >
        {children}
      </div>
    </div>
  );
}
