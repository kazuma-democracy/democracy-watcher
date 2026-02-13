#!/usr/bin/env python3
"""
import_bills.py - SmartNews SMRI の議案データをSupabaseにインポート
衆議院・参議院の gian.csv を読み込み、bills + bill_votes テーブルに投入。

使い方:
  python import_bills.py --shu house-of-representatives/data/gian.csv
  python import_bills.py --san house-of-councillors/data/gian.csv
  python import_bills.py --shu house-of-representatives/data/gian.csv --san house-of-councillors/data/gian.csv
"""

import os
import sys
import csv
import argparse
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def parse_int(val: str) -> int | None:
    """安全に整数変換"""
    try:
        return int(val.strip())
    except (ValueError, AttributeError):
        return None


def extract_result(date_result_str: str) -> tuple[str, str]:
    """
    '平成10年 3月19日／可決' → ('平成10年 3月19日', '可決')
    '／' だけ or 空 → ('', '')
    """
    if not date_result_str or date_result_str.strip() == '／':
        return ('', '')
    parts = date_result_str.split('／', 1)
    if len(parts) == 2:
        return (parts[0].strip(), parts[1].strip())
    return (parts[0].strip(), '')


def extract_committee(date_committee_str: str) -> str:
    """
    '平成10年 3月11日／内閣' → '内閣'
    """
    if not date_committee_str or '／' not in date_committee_str:
        return ''
    parts = date_committee_str.split('／', 1)
    return parts[1].strip() if len(parts) == 2 else ''


def parse_parties(party_str: str) -> list[str]:
    """
    '自由民主党・無所属の会;立憲民主党・無所属;公明党' → ['自由民主党・無所属の会', '立憲民主党・無所属', '公明党']
    セミコロン or 全角セミコロン区切り
    """
    if not party_str or not party_str.strip():
        return []
    # セミコロン(半角/全角)で分割
    parties = party_str.replace('；', ';').split(';')
    return [p.strip() for p in parties if p.strip()]


def process_shu_row(row: dict) -> tuple[dict, list[dict]]:
    """衆議院CSV 1行 → (bill_dict, vote_list)"""
    # 審議結果を抽出
    date_result = row.get('衆議院審議終了年月日／衆議院審議結果', '')
    date_passed, result = extract_result(date_result)

    # 付託委員会
    committee = extract_committee(row.get('衆議院付託年月日／衆議院付託委員会', ''))

    # 議案受理日
    date_submitted = row.get('衆議院議案受理年月日', '').strip()

    bill = {
        'house': '衆議院',
        'session': parse_int(row.get('掲載回次', '')),
        'submit_session': parse_int(row.get('提出回次', '')),
        'bill_type': row.get('議案種類', '').strip() or row.get('種類', '').strip(),
        'bill_number': parse_int(row.get('番号', '')),
        'bill_name': row.get('議案件名', '').strip(),
        'caption': row.get('キャプション', '').strip(),
        'status': row.get('審議状況', '').strip(),
        'proposer': row.get('議案提出者', '').strip(),
        'proposer_party': row.get('議案提出会派', '').strip(),
        'committee': committee,
        'date_submitted': date_submitted,
        'date_passed': date_passed,
        'result': result,
        'law_number': row.get('公布年月日／法律番号', '').strip(),
        'progress_url': row.get('経過情報URL', '').strip(),
    }

    # 賛否データ
    votes = []
    for party in parse_parties(row.get('衆議院審議時賛成会派', '')):
        votes.append({'party_name': party, 'vote': '賛成', 'chamber': '衆議院'})
    for party in parse_parties(row.get('衆議院審議時反対会派', '')):
        votes.append({'party_name': party, 'vote': '反対', 'chamber': '衆議院'})

    return bill, votes


def process_san_row(row: dict) -> tuple[dict, list[dict]]:
    """参議院CSV 1行 → (bill_dict, vote_list)"""
    # 参議院CSVのカラム名は異なる可能性がある
    # まずキー一覧から推測
    keys = list(row.keys())

    # 審議結果
    result_key = [k for k in keys if '審議終了' in k or '審議結果' in k]
    date_result = row.get(result_key[0], '') if result_key else ''
    date_passed, result = extract_result(date_result)

    # 付託委員会
    committee_key = [k for k in keys if '付託' in k and '予備' not in k]
    committee = ''
    if committee_key:
        committee = extract_committee(row.get(committee_key[0], ''))

    # 議案受理日
    date_key = [k for k in keys if '受理年月日' in k and '予備' not in k]
    date_submitted = row.get(date_key[0], '').strip() if date_key else ''

    # 議案種類
    bill_type = row.get('議案種類', '').strip()
    if not bill_type:
        bill_type = row.get('種類', '').strip()

    bill = {
        'house': '参議院',
        'session': parse_int(row.get('掲載回次', '')),
        'submit_session': parse_int(row.get('提出回次', '')),
        'bill_type': bill_type,
        'bill_number': parse_int(row.get('番号', '')),
        'bill_name': row.get('議案件名', '').strip(),
        'caption': row.get('キャプション', '').strip(),
        'status': row.get('審議状況', '').strip(),
        'proposer': row.get('議案提出者', '').strip(),
        'proposer_party': row.get('議案提出会派', '').strip(),
        'committee': committee,
        'date_submitted': date_submitted,
        'date_passed': date_passed,
        'result': result,
        'law_number': row.get('公布年月日／法律番号', '').strip(),
        'progress_url': row.get('経過情報URL', '').strip(),
    }

    # 参議院の賛否カラム
    votes = []
    for key in keys:
        if '賛成会派' in key:
            for party in parse_parties(row.get(key, '')):
                votes.append({'party_name': party, 'vote': '賛成', 'chamber': '参議院'})
        elif '反対会派' in key:
            for party in parse_parties(row.get(key, '')):
                votes.append({'party_name': party, 'vote': '反対', 'chamber': '参議院'})

    return bill, votes


def deduplicate_bills(bills_and_votes: list[tuple[dict, list[dict]]]) -> list[tuple[dict, list[dict]]]:
    """
    gian.csvは途中経過も含むため、同一議案が複数行ある。
    (submit_session, bill_type, bill_number) で重複除去し、最新（掲載回次が大きい）を優先。
    """
    seen = {}
    for bill, votes in bills_and_votes:
        key = (bill['house'], bill.get('submit_session'), bill.get('bill_type'), bill.get('bill_number'))
        existing = seen.get(key)
        if existing is None or (bill.get('session') or 0) >= (existing[0].get('session') or 0):
            seen[key] = (bill, votes)
    return list(seen.values())


def import_csv(filepath: str, house: str):
    """CSVファイルを読み込んでSupabaseに投入"""
    print(f"\n{'='*50}")
    print(f"  {house} データ読み込み: {filepath}")
    print(f"{'='*50}")

    # CSV読み込み
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    print(f"  CSV行数: {len(rows)}")

    # パース
    processor = process_shu_row if house == '衆議院' else process_san_row
    bills_and_votes = []
    for row in rows:
        try:
            bill, votes = processor(row)
            if bill['bill_name']:  # 件名がないものはスキップ
                bills_and_votes.append((bill, votes))
        except Exception as e:
            print(f"  WARNING: パースエラー: {e}")
            continue

    print(f"  パース成功: {len(bills_and_votes)}件")

    # 重複除去
    unique = deduplicate_bills(bills_and_votes)
    print(f"  重複除去後: {len(unique)}件")

    # bills upsert
    print(f"\n  --- bills upsert ---")
    bill_batch = []
    votes_by_key = {}

    for bill, votes in unique:
        key = (bill['house'], bill.get('submit_session'), bill.get('bill_type'), bill.get('bill_number'))
        bill_batch.append(bill)
        if votes:
            votes_by_key[key] = votes

    batch_size = 200
    for i in range(0, len(bill_batch), batch_size):
        batch = bill_batch[i:i + batch_size]
        supabase.table("bills").upsert(
            batch, on_conflict="house,submit_session,bill_type,bill_number"
        ).execute()
        print(f"    bills: {min(i + batch_size, len(bill_batch))}/{len(bill_batch)}")

    print(f"  bills完了: {len(bill_batch)}件")

    # bill_id マッピング取得
    print(f"\n  --- bill_votes upsert ---")
    total_votes = sum(len(v) for v in votes_by_key.values())
    if total_votes == 0:
        print("  賛否データなし")
        return

    # DBから bill の (house, submit_session, bill_type, bill_number) → id マッピング
    print(f"  マッピング取得中...")
    bill_id_map = {}
    page_size = 1000
    offset = 0
    while True:
        result = supabase.table("bills") \
            .select("id, house, submit_session, bill_type, bill_number") \
            .eq("house", house) \
            .range(offset, offset + page_size - 1) \
            .execute()
        rows = result.data or []
        for row in rows:
            key = (row['house'], row.get('submit_session'), row.get('bill_type'), row.get('bill_number'))
            bill_id_map[key] = row['id']
        if len(rows) < page_size:
            break
        offset += page_size
    print(f"  マッピング: {len(bill_id_map)}件")

    # votes upsert
    vote_batch = []
    missing = 0
    for key, votes in votes_by_key.items():
        bill_id = bill_id_map.get(key)
        if not bill_id:
            missing += 1
            continue
        for v in votes:
            v['bill_id'] = bill_id
            vote_batch.append(v)

    if missing:
        print(f"  WARNING: {missing}件のbillマッピング欠損")

    for i in range(0, len(vote_batch), batch_size):
        batch = vote_batch[i:i + batch_size]
        supabase.table("bill_votes").upsert(
            batch, on_conflict="bill_id,party_name,chamber"
        ).execute()
        if (i + batch_size) % 1000 < batch_size:
            print(f"    votes: {min(i + batch_size, len(vote_batch))}/{len(vote_batch)}")

    print(f"  bill_votes完了: {len(vote_batch)}件")

    # 統計
    with_votes = len([v for v in votes_by_key.values() if v])
    print(f"\n  === 統計 ===")
    print(f"  議案数: {len(bill_batch)}")
    print(f"  賛否データあり: {with_votes}件")
    print(f"  投票レコード: {len(vote_batch)}件")


def main():
    parser = argparse.ArgumentParser(description="議案データ インポート")
    parser.add_argument("--shu", help="衆議院 gian.csv パス")
    parser.add_argument("--san", help="参議院 gian.csv パス")
    args = parser.parse_args()

    if not args.shu and not args.san:
        print("ERROR: --shu または --san でCSVパスを指定してください")
        sys.exit(1)

    if args.shu:
        import_csv(args.shu, '衆議院')
    if args.san:
        import_csv(args.san, '参議院')

    print("\n✅ インポート完了!")


if __name__ == "__main__":
    main()
