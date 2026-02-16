import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase env vars')
  return createClient(url, serviceKey)
}

function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-admin-password')
  const expected = process.env.ADMIN_PASSWORD || 'democracy2026'
  return pw === expected
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { action } = body
    const db = getAdminClient()

    // ============================================================
    // verify_auth
    // ============================================================
    if (action === 'verify_auth') {
      return NextResponse.json({ ok: true })
    }

    // ============================================================
    // list — 検証カード一覧（下書き含む）
    // ============================================================
    if (action === 'list') {
      const { data: checks, error } = await db
        .from('fact_checks')
        .select('*, legislators(id, name, current_party)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error

      const checkIds = (checks || []).map((c: any) => c.id)
      let evidenceMap: Record<string, any[]> = {}

      if (checkIds.length > 0) {
        const { data: evidence } = await db
          .from('fact_check_evidence')
          .select('*')
          .in('fact_check_id', checkIds)
          .order('sort_order', { ascending: true })

        for (const e of evidence || []) {
          if (!evidenceMap[e.fact_check_id]) evidenceMap[e.fact_check_id] = []
          evidenceMap[e.fact_check_id].push(e)
        }
      }

      return NextResponse.json({
        checks: (checks || []).map((c: any) => ({
          ...c,
          evidence: evidenceMap[c.id] || [],
        })),
      })
    }

    // ============================================================
    // create — 新規検証カード作成
    // ============================================================
    if (action === 'create') {
      const { data: fc, error } = await db
        .from('fact_checks')
        .insert({
          legislator_id: body.legislator_id,
          title: body.title,
          category: body.category || 'other',
          topic: body.topic || null,
          stance: body.stance || null,
          claim: body.claim,
          claim_date: body.claim_date || null,
          claim_source_url: body.claim_source_url || null,
          claim_speech_id: body.claim_speech_id || null,
          verdict: body.verdict || null,
          evidence_grade: body.evidence_grade || null,
          analysis: body.analysis || null,
          context_notes: body.context_notes || null,
          possible_counterpoints: body.possible_counterpoints || null,
          status: 'draft',
          is_published: false,
        })
        .select()
        .single()

      if (error) throw error

      // 証拠を追加
      if (body.evidence && body.evidence.length > 0) {
        const evidenceRows = body.evidence.map((e: any, i: number) => ({
          fact_check_id: fc.id,
          type: e.type || 'other',
          title: e.title || null,
          url: e.url || null,
          speech_id: e.speech_id || null,
          quote: e.quote || null,
          supports_claim: e.supports_claim ?? null,
          sort_order: i + 1,
        }))
        await db.from('fact_check_evidence').insert(evidenceRows)
      }

      return NextResponse.json({ ok: true, id: fc.id })
    }

    // ============================================================
    // update — 検証カード更新
    // ============================================================
    if (action === 'update') {
      const { error } = await db
        .from('fact_checks')
        .update({
          title: body.title,
          category: body.category,
          topic: body.topic || null,
          stance: body.stance || null,
          claim: body.claim,
          claim_date: body.claim_date || null,
          claim_source_url: body.claim_source_url || null,
          claim_speech_id: body.claim_speech_id || null,
          verdict: body.verdict || null,
          evidence_grade: body.evidence_grade || null,
          analysis: body.analysis || null,
          context_notes: body.context_notes || null,
          possible_counterpoints: body.possible_counterpoints || null,
        })
        .eq('id', body.id)

      if (error) throw error

      // 証拠を差し替え
      if (body.evidence) {
        await db.from('fact_check_evidence').delete().eq('fact_check_id', body.id)
        if (body.evidence.length > 0) {
          const evidenceRows = body.evidence.map((e: any, i: number) => ({
            fact_check_id: body.id,
            type: e.type || 'other',
            title: e.title || null,
            url: e.url || null,
            speech_id: e.speech_id || null,
            quote: e.quote || null,
            supports_claim: e.supports_claim ?? null,
            sort_order: i + 1,
          }))
          await db.from('fact_check_evidence').insert(evidenceRows)
        }
      }

      return NextResponse.json({ ok: true })
    }

    // ============================================================
    // toggle_publish — 公開/非公開切り替え
    // ============================================================
    if (action === 'toggle_publish') {
      const newState = body.is_published
      const updateData: any = { is_published: newState }
      if (newState) {
        updateData.status = 'published'
      } else {
        updateData.status = 'draft'
      }
      const { error } = await db
        .from('fact_checks')
        .update(updateData)
        .eq('id', body.fact_check_id)

      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // ============================================================
    // delete — 検証カード削除
    // ============================================================
    if (action === 'delete') {
      // cascade で evidence, updates も消える
      const { error } = await db
        .from('fact_checks')
        .delete()
        .eq('id', body.fact_check_id)

      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // ============================================================
    // search_legislators — 議員検索
    // ============================================================
    if (action === 'search_legislators') {
      const { data, error } = await db
        .from('legislators')
        .select('id, name, current_party, house')
        .ilike('name', `%${body.query}%`)
        .limit(10)

      if (error) throw error
      return NextResponse.json({ legislators: data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('Fact-check API error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
