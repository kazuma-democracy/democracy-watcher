#!/usr/bin/env node
/**
 * 不祥事一括登録スクリプト
 * 自民党裏金問題（パーティー券収入不記載）
 * 
 * 使い方:
 *   node scripts/bulk-scandals.mjs              # 本番実行
 *   node scripts/bulk-scandals.mjs --dry-run    # DB書き込みなし確認
 * 
 * 必要: .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ============================================================
// .env.local 読み込み
// ============================================================
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) process.env[key] = val
      }
    }
  } catch { /* ignore */ }
}
loadEnv()

const DRY_RUN = process.argv.includes('--dry-run')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey)

// ============================================================
// 裏金議員データ（報道ベース）
// ============================================================

// 処分レベル
const DISCIPLINE = {
  EXPULSION: '除名',          // 池田佳隆（逮捕後）
  LEAVE_RECOMMEND: '離党勧告', // 塩谷、世耕
  MEMBERSHIP_STOP_1Y: '党員資格停止1年', // 下村、西村康稔
  MEMBERSHIP_STOP_6M: '党員資格停止6ヶ月', // 高木毅
  ROLE_STOP_1Y: '役職停止1年',
  ROLE_STOP_6M: '役職停止6ヶ月',
  WARNING: '戒告',
  ATTENTION: '注意（幹事長）',
  NONE: '処分なし',
}

// 全議員リスト: [名前, 派閥, 不記載額(万円), 処分, 院(H=衆/S=参), 備考]
const URAGANE_MEMBERS = [
  // --- 逮捕・起訴・有罪 ---
  ['池田佳隆',   '安倍派', 4826, DISCIPLINE.EXPULSION, 'H', '逮捕・起訴（証拠隠滅）'],
  ['大野泰正',   '安倍派', 5154, DISCIPLINE.EXPULSION, 'S', '在宅起訴・公判中'],
  ['谷川弥一',   '安倍派', 4355, DISCIPLINE.EXPULSION, 'H', '議員辞職・略式命令（罰金・公民権停止）'],
  ['堀井学',     '安倍派', 2196, DISCIPLINE.ROLE_STOP_1Y, 'H', '略式命令（罰金・公民権停止）'],

  // --- 離党勧告 ---
  ['塩谷立',     '安倍派',  234, DISCIPLINE.LEAVE_RECOMMEND, 'H', '安倍派座長'],
  ['世耕弘成',   '安倍派', 1542, DISCIPLINE.LEAVE_RECOMMEND, 'S', '参院安倍派会長→離党→復党→衆院鞍替え当選'],

  // --- 党員資格停止 ---
  ['下村博文',   '安倍派',  476, DISCIPLINE.MEMBERSHIP_STOP_1Y, 'H', '元政調会長・事務総長経験者'],
  ['西村康稔',   '安倍派',  100, DISCIPLINE.MEMBERSHIP_STOP_1Y, 'H', '前経産相・安倍派5人衆・事務総長経験者'],
  ['高木毅',     '安倍派', 1019, DISCIPLINE.MEMBERSHIP_STOP_6M, 'H', '前国対委員長・安倍派5人衆'],

  // --- 役職停止1年 ---
  ['武田良太',   '二階派', 1172, DISCIPLINE.ROLE_STOP_1Y, 'H', '元総務相・二階派事務総長'],
  ['松野博一',   '安倍派', 1051, DISCIPLINE.ROLE_STOP_1Y, 'H', '前官房長官・安倍派5人衆'],
  ['萩生田光一', '安倍派', 2728, DISCIPLINE.ROLE_STOP_1Y, 'H', '前政調会長・安倍派5人衆'],
  ['林幹雄',     '二階派', 1512, DISCIPLINE.ROLE_STOP_1Y, 'H', '元経産相'],
  ['平沢勝栄',   '二階派', 1080, DISCIPLINE.ROLE_STOP_1Y, 'H', '元復興相'],
  ['三ツ林裕巳', '安倍派', 2954, DISCIPLINE.ROLE_STOP_1Y, 'H', '不記載額第2位'],
  ['橋本聖子',   '安倍派', 2057, DISCIPLINE.ROLE_STOP_1Y, 'S', '元五輪相'],
  ['山谷えり子', '安倍派', 2403, DISCIPLINE.ROLE_STOP_1Y, 'S', '元国家公安委員長'],

  // --- 役職停止6ヶ月 ---
  ['衛藤征士郎', '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'H', '元衆院副議長'],
  ['小田原潔',   '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'H', '2024衆院選非公認'],
  ['菅家一郎',   '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'H', '2024衆院選非公認'],
  ['杉田水脈',   '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'H', '出馬辞退'],
  ['中根一幸',   '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'H', '2024衆院選非公認'],
  ['宗清皇一',   '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'H', ''],
  ['簗和生',     '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'H', ''],
  ['宮本周司',   '安倍派',  500, DISCIPLINE.ROLE_STOP_6M, 'S', ''],

  // --- 戒告（衆院） ---
  ['尾身朝子',   '安倍派',  500, DISCIPLINE.WARNING, 'H', '出馬辞退'],
  ['大塚拓',     '安倍派',  500, DISCIPLINE.WARNING, 'H', ''],
  ['柴山昌彦',   '安倍派',  500, DISCIPLINE.WARNING, 'H', '元文科相'],
  ['関芳弘',     '安倍派',  836, DISCIPLINE.WARNING, 'H', ''],
  ['高鳥修一',   '安倍派',  544, DISCIPLINE.WARNING, 'H', ''],
  ['西村明宏',   '安倍派',  500, DISCIPLINE.WARNING, 'H', '元環境相'],
  ['細田健一',   '安倍派',  564, DISCIPLINE.WARNING, 'H', '2024衆院選非公認'],
  ['吉野正芳',   '安倍派',  500, DISCIPLINE.WARNING, 'H', '元復興相'],
  ['和田義明',   '安倍派',  500, DISCIPLINE.WARNING, 'H', ''],

  // --- 戒告（参院） ---
  ['岡田直樹',   '安倍派',  500, DISCIPLINE.WARNING, 'S', '元地方創生相'],
  ['加田裕之',   '安倍派',  500, DISCIPLINE.WARNING, 'S', ''],
  ['末松信介',   '安倍派',  584, DISCIPLINE.WARNING, 'S', '元文科相'],
  ['羽生田俊',   '安倍派',  500, DISCIPLINE.WARNING, 'S', ''],
  ['堀井巌',     '安倍派',  876, DISCIPLINE.WARNING, 'S', ''],
  ['丸川珠代',   '安倍派',  500, DISCIPLINE.WARNING, 'S', '元五輪相'],
  ['山田宏',     '安倍派',  500, DISCIPLINE.WARNING, 'S', ''],
  ['山谷えり子', '安倍派',  500, DISCIPLINE.WARNING, 'S', ''], // 重複注意：上の役職停止と合わせて確認

  // --- 500万未満・注意のみ ---
  ['二階俊博',   '二階派', 3526, DISCIPLINE.NONE, 'H', '元幹事長・二階派会長・不出馬表明で処分免除・不記載額最多'],
  ['石井正弘',   '安倍派',  378, DISCIPLINE.ATTENTION, 'S', ''],
  ['若林健太',   '安倍派',  368, DISCIPLINE.ATTENTION, 'S', ''],
  ['江島潔',     '安倍派',  280, DISCIPLINE.ATTENTION, 'S', ''],
  ['赤池誠章',   '安倍派',  268, DISCIPLINE.ATTENTION, 'S', ''],
  ['木村次郎',   '安倍派',  236, DISCIPLINE.ATTENTION, 'H', ''],
  ['松川るい',   '安倍派',  204, DISCIPLINE.ATTENTION, 'S', ''],
  ['井原巧',     '安倍派',  168, DISCIPLINE.ATTENTION, 'S', ''],
  ['宮内秀樹',   '二階派',  161, DISCIPLINE.ATTENTION, 'H', ''],
  ['宮澤博行',   '安倍派',  140, DISCIPLINE.ATTENTION, 'H', '元防衛副大臣・辞任'],
  ['北村経夫',   '安倍派',  118, DISCIPLINE.ATTENTION, 'S', ''],
  ['長峯誠',     '安倍派',  116, DISCIPLINE.ATTENTION, 'S', ''],
  ['野上浩太郎', '安倍派',  100, DISCIPLINE.ATTENTION, 'S', '元官房副長官'],
  ['田畑裕明',   '安倍派',   68, DISCIPLINE.ATTENTION, 'H', ''],
  ['鈴木淳司',   '安倍派',   60, DISCIPLINE.ATTENTION, 'H', '元総務相・更迭'],
  ['山本順三',   '安倍派',   58, DISCIPLINE.ATTENTION, 'S', ''],
  ['高橋はるみ', '安倍派',   22, DISCIPLINE.ATTENTION, 'S', '元北海道知事'],
  ['藤原崇',     '安倍派',   14, DISCIPLINE.ATTENTION, 'H', ''],
  ['山崎正昭',   '安倍派',    4, DISCIPLINE.ATTENTION, 'S', '元参院議長'],
  ['西田昌司',   '安倍派',  411, DISCIPLINE.ATTENTION, 'S', '政倫審出席'],
]

// 重複除去（山谷えり子が2回入ってるので）
const seen = new Set()
const MEMBERS = URAGANE_MEMBERS.filter(m => {
  if (seen.has(m[0])) return false
  seen.add(m[0])
  return true
})

// ============================================================
// 登録する不祥事レコード
// ============================================================
const SCANDALS = [
  // ① メインの裏金問題（全員紐づけ）
  {
    title: '自民党派閥パーティー券裏金問題',
    category: 'political_funds',
    severity: 'confirmed',
    start_date: '2022-11-01',
    summary: `2022年11月のしんぶん赤旗報道を端緒に、自民党の派閥（特に安倍派・二階派）が政治資金パーティー券の販売ノルマ超過分を所属議員にキックバック（還流）し、政治資金収支報告書に不記載としていた事件。5年間で総額約5.7億円超の不記載が判明。東京地検特捜部が安倍派・二階派を強制捜査し、議員・秘書・派閥職員計11人が立件された。2024年4月、自民党は39人を処分（離党勧告2人、党員資格停止3人、役職停止17人、戒告17人）。不記載があった議員は計85人。事件を受け安倍派・二階派など5派閥が解散。2024年衆院選で自民党は大幅議席減となった。`,
    // 全員を紐づけ
    members: MEMBERS.map(m => m[0]),
  },

  // ② 逮捕・起訴案件（個別）
  {
    title: '池田佳隆議員 裏金4826万円で逮捕・起訴',
    category: 'political_funds',
    severity: 'convicted',
    start_date: '2024-01-07',
    summary: '安倍派所属の池田佳隆衆院議員が、政治資金収支報告書に約4826万円を不記載として政治資金規正法違反容疑で逮捕・起訴。証拠隠滅の恐れありとして会計責任者の秘書とともに逮捕された。除名処分。',
    members: ['池田佳隆'],
  },
  {
    title: '大野泰正議員 裏金5154万円で在宅起訴',
    category: 'political_funds',
    severity: 'convicted',
    start_date: '2024-01-19',
    summary: '安倍派所属の大野泰正参院議員が、不記載額5154万円（最多級）で政治資金規正法違反容疑により在宅起訴。公判中。',
    members: ['大野泰正'],
  },
  {
    title: '谷川弥一議員 裏金4355万円で略式命令・議員辞職',
    category: 'political_funds',
    severity: 'convicted',
    start_date: '2024-01-13',
    summary: '安倍派所属の谷川弥一衆院議員が、不記載額4355万円で略式命令（罰金・公民権停止）を受け、議員辞職。',
    members: ['谷川弥一'],
  },

  // ③ 二階俊博（処分免除だが最多級）
  {
    title: '二階俊博元幹事長 裏金3526万円も処分なし',
    category: 'political_funds',
    severity: 'confirmed',
    start_date: '2024-02-13',
    summary: '二階派会長の二階俊博元幹事長は、不記載額3526万円で全議員中最多額の一人。しかし次期衆院選不出馬を表明したことで「自ら政治責任を取った」として処分対象外に。二階派の元会計責任者は有罪判決。二階氏の秘書も略式命令を受けた。',
    members: ['二階俊博'],
  },
]

// ============================================================
// 実行
// ============================================================
async function main() {
  console.log('🏛️ 自民党裏金問題 一括登録スクリプト')
  console.log(`   モード: ${DRY_RUN ? '🧪 ドライラン（DB書き込みなし）' : '🚀 本番実行'}`)
  console.log(`   対象議員: ${MEMBERS.length}人`)
  console.log(`   登録不祥事: ${SCANDALS.length}件`)
  console.log('')

  // ① 既存の裏金関連スキャンダルがあるか確認
  const { data: existing } = await db
    .from('scandals')
    .select('id, title')
    .ilike('title', '%裏金%')
  
  if (existing && existing.length > 0) {
    console.log('⚠️ 既存の裏金関連不祥事:')
    for (const s of existing) {
      console.log(`   - ${s.title} (${s.id})`)
    }
    console.log('')
    console.log('   重複を避けるため、既存レコードは上書きしません。')
    console.log('   削除して再登録する場合は管理画面から削除してください。')
    console.log('')
  }

  // ② 議員名でDB検索して legislator_id を取得
  console.log('👤 議員名のDB照合を開始...')
  const legMap = new Map() // name -> legislator_id
  let matched = 0
  let notFound = 0
  const notFoundNames = []

  for (const [name] of MEMBERS) {
    // 名前で完全一致 or 部分一致
    const { data } = await db
      .from('legislators')
      .select('id, name')
      .or(`name.eq.${name},name.ilike.%${name}%`)
      .limit(1)
    
    if (data && data.length > 0) {
      legMap.set(name, data[0].id)
      matched++
    } else {
      // 姓だけで検索
      const surname = name.substring(0, 2)
      const { data: partial } = await db
        .from('legislators')
        .select('id, name')
        .ilike('name', `%${surname}%`)
        .limit(5)
      
      const exact = partial?.find(p => p.name.replace(/\s/g, '') === name)
      if (exact) {
        legMap.set(name, exact.id)
        matched++
      } else {
        notFound++
        notFoundNames.push(name)
      }
    }
  }

  console.log(`   ✅ DB照合: ${matched}/${MEMBERS.length} 一致`)
  if (notFoundNames.length > 0) {
    console.log(`   ❌ 未発見 (${notFound}人): ${notFoundNames.join(', ')}`)
    console.log('   → 議員インポート完了後に再実行してください')
  }
  console.log('')

  if (DRY_RUN) {
    console.log('🧪 ドライラン: 以下の不祥事を登録予定')
    for (const sc of SCANDALS) {
      const linkedCount = sc.members.filter(n => legMap.has(n)).length
      console.log(`   📌 ${sc.title}`)
      console.log(`      カテゴリ: ${sc.category} / 深刻度: ${sc.severity}`)
      console.log(`      議員紐づけ: ${linkedCount}/${sc.members.length}人`)
    }
    console.log('')
    console.log('✅ ドライラン完了。--dry-run を外して再実行すると本番登録します。')
    return
  }

  // ③ 不祥事レコードを登録
  let created = 0
  let skipped = 0

  for (const sc of SCANDALS) {
    // 同名チェック
    const { data: dup } = await db
      .from('scandals')
      .select('id')
      .eq('title', sc.title)
      .limit(1)
    
    if (dup && dup.length > 0) {
      console.log(`   ⏭️ スキップ（既存）: ${sc.title}`)
      skipped++
      continue
    }

    // 不祥事本体を登録
    const { data: scandal, error: scandalErr } = await db
      .from('scandals')
      .insert({
        title: sc.title,
        category: sc.category,
        severity: sc.severity,
        start_date: sc.start_date,
        summary: sc.summary,
        is_published: true,
      })
      .select()
      .single()

    if (scandalErr) {
      console.error(`   ❌ 登録失敗: ${sc.title}`, scandalErr.message)
      continue
    }

    console.log(`   ✅ 登録: ${sc.title} (${scandal.id})`)

    // 議員紐づけ
    const peopleRows = sc.members
      .filter(name => legMap.has(name))
      .map(name => ({
        scandal_id: scandal.id,
        legislator_id: legMap.get(name),
        role: 'subject',
      }))
    
    if (peopleRows.length > 0) {
      const { error: pplErr } = await db
        .from('scandal_people')
        .insert(peopleRows)
      
      if (pplErr) {
        console.error(`      ⚠️ 議員紐づけエラー:`, pplErr.message)
      } else {
        console.log(`      👤 ${peopleRows.length}人を紐づけ`)
      }
    }

    // ソース（報道出典）
    const sources = [
      { url: 'https://www.jiji.com/jc/v8?id=202410uragane-team', publisher: '時事通信', snippet: '「裏金議員」がイチから分かる' },
      { url: 'https://www.nikkei.com/article/DGXZQOUA01BDB0R00C24A4000000/', publisher: '日本経済新聞', snippet: '自民党が処分対象とした39人の議員ら一覧' },
      { url: 'https://clearing-house.org/?p=6069', publisher: '情報公開クリアリングハウス', snippet: '裏金国会議員一覧・金額' },
    ]
    const sourceRows = sources.map(s => ({
      scandal_id: scandal.id,
      url: s.url,
      publisher: s.publisher,
      snippet: s.snippet,
    }))
    await db.from('scandal_sources').insert(sourceRows).catch(() => {})

    // タイムライン
    await db.from('scandal_timeline').insert({
      scandal_id: scandal.id,
      event_date: sc.start_date,
      event_type: 'reported',
      description: '報道により発覚',
    }).catch(() => {})

    created++
  }

  console.log('')
  console.log('========================================')
  console.log(`📊 完了!`)
  console.log(`   登録: ${created}件`)
  console.log(`   スキップ（既存）: ${skipped}件`)
  console.log(`   議員照合: ${matched}/${MEMBERS.length}人`)
  if (notFoundNames.length > 0) {
    console.log(`   未発見: ${notFoundNames.join(', ')}`)
  }
  console.log('========================================')

  // ④ 結果確認
  const { count: totalScandals } = await db
    .from('scandals')
    .select('*', { count: 'exact', head: true })
  const { count: totalPeople } = await db
    .from('scandal_people')
    .select('*', { count: 'exact', head: true })
  
  console.log('')
  console.log(`📈 DB状態: 不祥事 ${totalScandals}件 / 議員紐づけ ${totalPeople}件`)
}

main().catch(err => {
  console.error('致命的エラー:', err)
  process.exit(1)
})
