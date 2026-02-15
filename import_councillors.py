#!/usr/bin/env python3
"""参議院データインポートスクリプト
SMRI house-of-councillors リポジトリのCSVからSupabaseにインポート

使い方:
  python import_councillors.py --dry-run     # 確認のみ
  python import_councillors.py               # 本実行
  python import_councillors.py --bills-only  # 議案のみ
  python import_councillors.py --legs-only   # 議員のみ
"""

import csv
import sys
import os
import hashlib
import re
import uuid

def make_uuid(seed: str) -> str:
    """シード文字列からUUID v5を生成"""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))

# Supabase設定
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

# .env.localから読み込み
if not SUPABASE_URL:
    env_paths = ['.env.local', '../.env.local']
    for ep in env_paths:
        if os.path.exists(ep):
            with open(ep, encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
                        SUPABASE_URL = line.split('=', 1)[1].strip('"\'')
                    elif line.startswith('NEXT_PUBLIC_SUPABASE_ANON_KEY='):
                        SUPABASE_KEY = line.split('=', 1)[1].strip('"\'')
            break

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase環境変数が設定されていません")
    print("  .env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("supabaseパッケージをインストールしてください: pip install supabase")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# データディレクトリ
DATA_DIR = os.path.join(os.path.dirname(__file__), "house-of-councillors", "data")

# ===== 会派マッピング =====
def load_kaiha_map():
    """略称 → フルネーム のマッピング"""
    mapping = {}
    path = os.path.join(DATA_DIR, "kaiha.csv")
    with open(path, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            mapping[row['略称']] = row['会派名']
    return mapping

# ===== 議員インポート =====
def import_legislators(dry_run=False):
    print("\n===== 参議院議員インポート =====")
    kaiha = load_kaiha_map()

    path = os.path.join(DATA_DIR, "giin.csv")
    with open(path, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    print(f"  CSV: {len(rows)}名")

    # 既存の参議院議員を確認
    existing = supabase.table('legislators').select('id, name').execute()
    existing_by_name = {r['name']: r['id'] for r in existing.data}
    print(f"  既存DB: {len(existing_by_name)}名")

    new_legs = []
    for r in rows:
        name = r['議員氏名'].replace('　', ' ').strip()
        abbrev = r['会派']
        full_party = kaiha.get(abbrev, abbrev)

        # 既存の議員なら既存IDを使う（衆→参の転身等）
        existing_id = existing_by_name.get(name)

        leg = {
            'id': existing_id if existing_id else make_uuid(f"sangiin_{name}"),
            'name': name,
            'name_yomi': r['読み方'].replace('　', ' ').strip(),
            'house': '参議院',
            'current_party': full_party,
            'current_position': r.get('役職等', '') or None,
            'photo_url': r.get('写真URL', '') or None,
        }
        new_legs.append(leg)

    # 新規 vs 更新
    new_count = sum(1 for l in new_legs if l['name'] not in existing_by_name)
    update_count = len(new_legs) - new_count
    print(f"  新規: {new_count}名, 更新: {update_count}名")

    if dry_run:
        # サンプル表示
        for l in new_legs[:5]:
            tag = "NEW" if l['name'] not in existing_by_name else "UPD"
            print(f"    [{tag}] {l['name']} ({l['current_party']})")
        print(f"    ... 他 {len(new_legs) - 5}名")
        return new_legs

    # DB upsert（50件ずつ）
    print("  DB更新中...")
    for i in range(0, len(new_legs), 50):
        batch = new_legs[i:i+50]
        supabase.table('legislators').upsert(batch, on_conflict='id').execute()
        print(f"    {min(i+50, len(new_legs))}/{len(new_legs)}")

    print(f"  ✅ 議員 {len(new_legs)}名 完了")
    return new_legs


# ===== 議案インポート =====
def map_bill_type(kind):
    """参議院の種類 → 統一bill_type"""
    if '内閣提出' in kind:
        return '閣法'
    if '衆法' in kind:
        return '衆法'
    if '参法' in kind:
        return '参法'
    if kind.startswith('予算'):
        return '予算'
    if kind.startswith('条約'):
        return '条約'
    if kind.startswith('決議案'):
        return '決議'
    if '承認' in kind or '承諾' in kind:
        return '承認'
    if '人事' in kind:
        return '承認'  # 人事案件も承認扱い
    if '決算' in kind or '計算書' in kind or '国有財産' in kind or 'NHK' in kind:
        return '決算'
    if '規則' in kind or '規程' in kind:
        return 'その他'
    if '懲罰' in kind:
        return 'その他'
    if '憲法' in kind:
        return '決議'
    return 'その他'


def map_status(row):
    """参議院の議決情報 → 統一status"""
    sangiin_result = row.get('参議院本会議経過情報 - 議決', '').strip()
    shuugiin_result = row.get('衆議院本会議経過情報 - 議決', '').strip()
    committee_result = row.get('参議院委員会等経過情報 - 議決・継続結果', '').strip()

    # 本会議結果で判定
    if sangiin_result == '可決' or sangiin_result == '修正':
        if shuugiin_result in ('可決', '修正', ''):
            return '成立'
    if sangiin_result == '否決':
        return '否決'
    if sangiin_result in ('同意', '承認', '承諾', '是認', '事後承認'):
        return '成立'
    if sangiin_result in ('不同意', '不承諾', '不承認', '是認しない'):
        return '否決'

    # 委員会の継続審査
    if '継続' in committee_result or '継続' in sangiin_result:
        return '審議中'

    # 審議中
    if committee_result and not sangiin_result:
        return '審議中'

    # 何もない場合
    if not sangiin_result and not committee_result:
        return '未了'

    return '審議中'


def import_bills(dry_run=False):
    print("\n===== 参議院議案インポート =====")

    path = os.path.join(DATA_DIR, "gian.csv")
    with open(path, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    print(f"  CSV: {len(rows)}件")

    # (表)は除外（表決の表であり重複）
    rows = [r for r in rows if '（表）' not in r['種類']]
    print(f"  (表)除外後: {len(rows)}件")

    bills = []
    for r in rows:
        session = int(r['審議回次']) if r['審議回次'].isdigit() else None
        submit_session = int(r['提出回次']) if r['提出回次'].isdigit() else None
        bill_number = int(r['提出番号']) if r['提出番号'].isdigit() else None
        bill_type = map_bill_type(r['種類'])
        status = map_status(r)

        # 提出者の判定
        proposer = r.get('議案審議情報一覧 - 提出者', '').strip()
        proposer_submitter = r.get('議案審議情報一覧 - 提出者区分', '').strip()
        proposer_initiator = r.get('議案審議情報一覧 - 発議者', '').strip()
        if not proposer:
            proposer = proposer_initiator or proposer_submitter or None
            if bill_type == '閣法' and not proposer:
                proposer = '内閣'

        # ID生成（件名全体を使ってユニークにする）
        bill_id = make_uuid(f"sangiin_{session}_{r['種類']}_{bill_number}_{r['件名']}")

        # 議案URL
        progress_url = r.get('議案URL', '').strip() or None

        # 法律番号
        law_number = r.get('その他の情報 - 法律番号', '').strip() or None

        # 委員会
        committee = r.get('参議院委員会等経過情報 - 付託委員会等', '').strip() or None

        # 投票結果URL
        vote_url = r.get('参議院本会議経過情報 - 投票結果', '').strip() or None

        # 採決態様
        vote_method = r.get('参議院本会議経過情報 - 採決態様', '').strip() or None

        bill = {
            'id': bill_id,
            'house': '参議院',
            'session': session,
            'submit_session': submit_session,
            'bill_type': bill_type,
            'bill_number': bill_number,
            'bill_name': r['件名'],
            'caption': None,
            'status': status,
            'proposer': proposer,
            'proposer_party': None,
            'committee': committee,
            'date_submitted': r.get('議案審議情報一覧 - 提出日', '').strip() or None,
            'date_passed': r.get('参議院本会議経過情報 - 議決日', '').strip() or None,
            'result': r.get('参議院本会議経過情報 - 議決', '').strip() or None,
            'law_number': law_number,
            'progress_url': progress_url,
        }
        bills.append(bill)

    # 統計
    type_counts = {}
    status_counts = {}
    for b in bills:
        type_counts[b['bill_type']] = type_counts.get(b['bill_type'], 0) + 1
        status_counts[b['status']] = status_counts.get(b['status'], 0) + 1

    print(f"\n  種類別:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"    {t}: {c}")
    print(f"\n  ステータス別:")
    for s, c in sorted(status_counts.items(), key=lambda x: -x[1]):
        print(f"    {s}: {c}")

    # 回次の範囲
    sessions = [b['session'] for b in bills if b['session']]
    print(f"\n  回次: {min(sessions)} ～ {max(sessions)}")

    # 重複ID除去
    seen_ids = set()
    unique_bills = []
    for b in bills:
        if b['id'] in seen_ids:
            continue
        seen_ids.add(b['id'])
        unique_bills.append(b)
    if len(unique_bills) < len(bills):
        print(f"  ⚠️ 重複ID {len(bills) - len(unique_bills)}件を除去 → {len(unique_bills)}件")
    bills = unique_bills

    if dry_run:
        print(f"\n  サンプル（最初の10件）:")
        for b in bills[:10]:
            print(f"    📜 [{b['bill_type']}] {b['bill_name'][:60]}")
            print(f"       状態={b['status']} 回次={b['session']} 委員会={b['committee']}")
        return bills

    # DB upsert（50件ずつ）
    print(f"\n  DB更新中... ({len(bills)}件)")
    for i in range(0, len(bills), 50):
        batch = bills[i:i+50]
        supabase.table('bills').upsert(batch, on_conflict='id').execute()
        if (i + 50) % 500 == 0 or i + 50 >= len(bills):
            print(f"    {min(i+50, len(bills))}/{len(bills)}")

    print(f"  ✅ 議案 {len(bills)}件 完了")
    return bills


# ===== メイン =====
if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    bills_only = '--bills-only' in sys.argv
    legs_only = '--legs-only' in sys.argv

    if dry_run:
        print("⚠️  --dry-run モード: DB更新はスキップ")

    if not bills_only:
        import_legislators(dry_run)

    if not legs_only:
        import_bills(dry_run)

    if not dry_run:
        print("\n🎉 参議院データインポート完了!")
        print("次のステップ:")
        print("  1. python categorize_bills.py  # カテゴリ分類を再実行")
        print("  2. UIで参議院の議案が表示されるか確認")
