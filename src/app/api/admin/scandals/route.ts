import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client for admin operations
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var')
  }
  return createClient(url, serviceKey)
}

// Simple admin password check
function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-admin-password')
  const expected = process.env.ADMIN_PASSWORD || 'democracy2026'
  return pw === expected
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { action } = body
    const db = getAdminClient()

    if (action === 'create_scandal') {
      const { title, category, severity, start_date, summary, sources, legislator_ids } = body

      // 1. Insert scandal
      const { data: scandal, error: scandalErr } = await db
        .from('scandals')
        .insert({
          title,
          category,
          severity: severity || 'allegation',
          start_date: start_date || null,
          summary,
          is_published: true,
        })
        .select()
        .single()

      if (scandalErr) throw scandalErr

      // 2. Insert sources
      if (sources?.length > 0) {
        const sourceRows = sources.map((s: any) => ({
          scandal_id: scandal.id,
          url: s.url,
          publisher: s.publisher || null,
          published_at: s.published_at || null,
          snippet: s.snippet || null,
        }))
        await db.from('scandal_sources').insert(sourceRows)
      }

      // 3. Link legislators
      if (legislator_ids?.length > 0) {
        const peopleRows = legislator_ids.map((lid: string) => ({
          scandal_id: scandal.id,
          legislator_id: lid,
          role: 'subject',
        }))
        await db.from('scandal_people').insert(peopleRows)
      }

      // 4. Add initial timeline entry
      await db.from('scandal_timeline').insert({
        scandal_id: scandal.id,
        event_date: start_date || new Date().toISOString().split('T')[0],
        event_type: 'reported',
        description: '報道により発覚',
      })

      return NextResponse.json({ scandal })
    }

    if (action === 'search_legislators') {
      const { query } = body
      const { data } = await db
        .from('legislators')
        .select('id, name, current_party, house')
        .or(`name.ilike.%${query}%,name_yomi.ilike.%${query}%`)
        .limit(10)
      return NextResponse.json({ legislators: data || [] })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
