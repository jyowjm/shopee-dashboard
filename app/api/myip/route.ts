import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res = await fetch('https://api.ipify.org?format=json');
  const data = await res.json();
  return NextResponse.json(data);
}
