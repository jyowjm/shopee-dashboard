import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderSn: string }> }
) {
  const { period_id, status, notes } = await req.json() as {
    period_id: string
    status: 'unreviewed' | 'investigating' | 'resolved'
    notes?: string
  }

  if (!period_id || !status) {
    return NextResponse.json({ error: 'period_id and status required' }, { status: 400 })
  }

  const { orderSn } = await params
  const supabase = getSupabase()
  const { error } = await supabase
    .from('recon_notes')
    .upsert({
      order_sn:   orderSn,
      period_id,
      status,
      notes:      notes ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_sn,period_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
