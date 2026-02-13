#!/usr/bin/env python3
"""
collect_daily.py - 国会会議録APIから新着データを自動収集
GitHub Actions で毎日実行。差分のみ取得してSupabaseに保存。

使い方:
  python collect_daily.py              # 最新3日分を取得
  python collect_daily.py --days 7     # 最新7日分を取得
  python collect_daily.py --from 2025-01-01 --until 2025-01-31  # 期間指定
"""

import os
import sys
import time
import json
import hashlib
import argparse
import requests
from datetime import datetime, timedelta
from supabase import create_client

# === 設定 ===
KOKKAI_API = "https://kokkai.ndl.go.jp/api/speech"
MAX_RECORDS_PER_REQUEST = 100
REQUEST_INTERVAL = 3  # API礼儀: 3秒間隔

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service_role key for write access

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# === API取得 ===

def fetch_speeches(from_date: str, until_date: str, start_record: int = 1) -> dict:
    """国会会議録APIから発言を取得"""
    params = {
        "from": from_date,
        "until": until_date,
        "recordPacking": "json",
        "maximumRecords": MAX_RECORDS_PER_REQUEST,
        "startRecord": start_record,
    }
    resp = requests.get(KOKKAI_API, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def fetch_all_speeches(from_date: str, until_date: str) -> list:
    """全ページを巡回して発言を取得"""
    all_records = []
    start = 1

    # まず総数を確認
    first = fetch_speeches(from_date, until_date, start_record=1)
    total = first.get("numberOfRecords", 0)
    print(f"  期間 {from_date} ~ {until_date}: {total}件の発言")

    if total == 0:
        return []

    # 最初のページを処理
    records = first.get("speechRecord", [])
    if isinstance(records, dict):
        records = [records]
    all_records.extend(records)

    # 残りのページ
    while len(all_records) < total:
        start += MAX_RECORDS_PER_REQUEST
        time.sleep(REQUEST_INTERVAL)
        print(f"    取得中... {len(all_records)}/{total}")
        data = fetch_speeches(from_date, until_date, start_record=start)
        records = data.get("speechRecord", [])
        if isinstance(records, dict):
            records = [records]
        if not records:
            break
        all_records.extend(records)

    print(f"  取得完了: {len(all_records)}件")
    return all_records


# === データ変換 ===

def make_meeting_id(record: dict) -> str:
    """会議IDを生成 (issueID がある場合はそれを使用)"""
    issue_id = record.get("issueID", "")
    if issue_id:
        return hashlib.md5(issue_id.encode()).hexdigest()
    # フォールバック
    key = f"{record.get('session','')}-{record.get('nameOfHouse','')}-{record.get('nameOfMeeting','')}-{record.get('issue','')}-{record.get('date','')}"
    return hashlib.md5(key.encode()).hexdigest()


def make_speech_id(record: dict) -> str:
    """発言IDを生成"""
    speech_id = record.get("speechID", "")
    if speech_id:
        return speech_id
    # フォールバック
    key = f"{make_meeting_id(record)}-{record.get('speechOrder', 0)}"
    return key


def record_to_meeting(record: dict) -> dict:
    """API レコード → meetings テーブル"""
    return {
        "id": make_meeting_id(record),
        "issue_id": record.get("issueID", ""),
        "session": int(record.get("session", 0)) if record.get("session") else None,
        "house": record.get("nameOfHouse", ""),
        "meeting_name": record.get("nameOfMeeting", ""),
        "issue_number": record.get("issue", ""),
        "date": record.get("date", ""),
        "meeting_url": record.get("meetingURL", ""),
    }


def record_to_speech(record: dict) -> dict:
    """API レコード → speeches テーブル"""
    return {
        "speech_id": make_speech_id(record),
        "meeting_id": make_meeting_id(record),
        "speech_order": int(record.get("speechOrder", 0)) if record.get("speechOrder") else None,
        "speaker_name": record.get("speaker", ""),
        "speaker_group": record.get("speakerGroup", ""),
        "speaker_position": record.get("speakerPosition", ""),
        "content": record.get("speech", ""),
        "speech_url": record.get("speechURL", ""),
        "date": record.get("date", ""),
    }


def record_to_legislator(record: dict) -> dict | None:
    """API レコード → legislators テーブル (発言者情報から抽出)"""
    name = record.get("speaker", "").strip()
    if not name:
        return None

    # 読みがなを抽出 (speaker フィールドにはない場合が多い)
    group = record.get("speakerGroup", "")
    position = record.get("speakerPosition", "")
    date = record.get("date", "")
    house = record.get("nameOfHouse", "")

    # 議員かどうかの簡易判定
    is_member = bool(group) and "大臣官房" not in (position or "")

    return {
        "name": name,
        "current_party": group if group else None,
        "current_position": position if position else None,
        "house": house if house else None,
        "is_member": is_member,
        "last_seen": date,
    }


# === Supabase 書き込み ===

def upsert_meetings(meetings: list[dict]):
    """会議を upsert（既存は更新せずスキップ）"""
    if not meetings:
        return

    # 重複除去（issue_id ベース）
    seen = {}
    for m in meetings:
        seen[m["issue_id"]] = m
    unique = list(seen.values())

    # INSERT ... ON CONFLICT DO NOTHING（既存の会議は変更しない）
    batch_size = 500
    for i in range(0, len(unique), batch_size):
        batch = unique[i:i + batch_size]
        supabase.table("meetings").upsert(
            batch, on_conflict="issue_id", ignore_duplicates=True
        ).execute()
    print(f"  会議: {len(unique)}件 upserted")


def upsert_speeches(speeches: list[dict]):
    """発言を upsert"""
    if not speeches:
        return

    # 重複除去
    seen = {}
    for s in speeches:
        seen[s["speech_id"]] = s
    unique = list(seen.values())

    # speech_id で既存チェック
    existing_ids = set()
    for i in range(0, len(unique), 500):
        batch_ids = [s["speech_id"] for s in unique[i:i + 500]]
        result = supabase.table("speeches").select("speech_id").in_("speech_id", batch_ids).execute()
        existing_ids.update(r["speech_id"] for r in (result.data or []))

    new_speeches = [s for s in unique if s["speech_id"] not in existing_ids]

    if not new_speeches:
        print("  発言: 新規なし（全て既存）")
        return

    # バッチ insert
    batch_size = 200
    for i in range(0, len(new_speeches), batch_size):
        batch = new_speeches[i:i + batch_size]
        supabase.table("speeches").insert(batch).execute()
    print(f"  発言: {len(new_speeches)}件 新規追加 (既存{len(existing_ids)}件スキップ)")


def upsert_legislators(legislators: list[dict]):
    """議員を upsert (名前ベースで既存チェック)"""
    if not legislators:
        return

    # 名前で重複除去（最新のデータを優先）
    by_name = {}
    for leg in legislators:
        name = leg["name"]
        if name not in by_name or (leg.get("last_seen", "") > by_name[name].get("last_seen", "")):
            by_name[name] = leg

    # 既存の議員名を取得
    existing = {}
    result = supabase.table("legislators").select("id, name, last_seen").execute()
    for r in (result.data or []):
        existing[r["name"]] = r

    new_count = 0
    update_count = 0

    for name, leg in by_name.items():
        if name in existing:
            # last_seen を更新（より新しい場合のみ）
            ex = existing[name]
            if leg.get("last_seen", "") > (ex.get("last_seen") or ""):
                supabase.table("legislators").update({
                    "last_seen": leg["last_seen"],
                    "current_party": leg["current_party"],
                }).eq("id", ex["id"]).execute()
                update_count += 1
        else:
            # 新規追加
            supabase.table("legislators").insert(leg).execute()
            new_count += 1

    print(f"  議員: 新規{new_count}件, 更新{update_count}件")

    # legislator_id を speeches にリンク
    link_legislators_to_speeches()


def link_legislators_to_speeches():
    """legislator_id が NULL の speeches に議員をリンク"""
    # NULL の speeches を取得
    result = supabase.table("speeches").select("id, speaker_name").is_("legislator_id", "null").limit(1000).execute()
    unlinked = result.data or []
    if not unlinked:
        return

    # 全議員の名前→ID マップ
    legs_result = supabase.table("legislators").select("id, name").execute()
    name_to_id = {r["name"]: r["id"] for r in (legs_result.data or [])}

    linked = 0
    for sp in unlinked:
        leg_id = name_to_id.get(sp["speaker_name"])
        if leg_id:
            supabase.table("speeches").update({"legislator_id": leg_id}).eq("id", sp["id"]).execute()
            linked += 1

    if linked:
        print(f"  リンク: {linked}件の発言に議員IDを紐付け")


# === メイン ===

def get_latest_date() -> str:
    """DB内の最新日付を取得"""
    result = supabase.table("speeches").select("date").order("date", desc=True).limit(1).execute()
    if result.data:
        return result.data[0]["date"]
    return "2024-01-01"


def main():
    parser = argparse.ArgumentParser(description="国会会議録 自動収集")
    parser.add_argument("--days", type=int, default=3, help="最新N日分を取得 (デフォルト: 3)")
    parser.add_argument("--from", dest="from_date", help="開始日 (YYYY-MM-DD)")
    parser.add_argument("--until", dest="until_date", help="終了日 (YYYY-MM-DD)")
    args = parser.parse_args()

    print("=" * 50)
    print("国会会議録 自動収集")
    print("=" * 50)

    # 期間を決定
    if args.from_date and args.until_date:
        from_date = args.from_date
        until_date = args.until_date
    else:
        # DBの最新日付から取得
        latest = get_latest_date()
        # 最新日の前日から（取りこぼし防止）
        from_dt = datetime.strptime(latest, "%Y-%m-%d") - timedelta(days=1)
        from_date = from_dt.strftime("%Y-%m-%d")
        until_date = datetime.now().strftime("%Y-%m-%d")
        print(f"DB最新日: {latest}")

    print(f"取得期間: {from_date} ~ {until_date}")
    print()

    # API から取得
    records = fetch_all_speeches(from_date, until_date)
    if not records:
        print("新着データなし")
        return

    # データ変換
    meetings = [record_to_meeting(r) for r in records]
    speeches = [record_to_speech(r) for r in records]
    legislators_raw = [record_to_legislator(r) for r in records]
    legislators = [l for l in legislators_raw if l is not None]

    print()
    print("--- Supabase 書き込み ---")

    # 書き込み
    upsert_meetings(meetings)
    upsert_speeches(speeches)
    upsert_legislators(legislators)

    print()
    print("完了!")
    print(f"  会議: {len(set(m['id'] for m in meetings))}件")
    print(f"  発言: {len(speeches)}件")
    print(f"  発言者: {len(set(l['name'] for l in legislators))}人")


if __name__ == "__main__":
    main()
