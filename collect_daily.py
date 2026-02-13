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
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

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

    first = fetch_speeches(from_date, until_date, start_record=1)
    total = first.get("numberOfRecords", 0)
    print(f"  期間 {from_date} ~ {until_date}: {total}件の発言")

    if total == 0:
        return []

    records = first.get("speechRecord", [])
    if isinstance(records, dict):
        records = [records]
    all_records.extend(records)

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

def make_speech_id(record: dict) -> str:
    """発言IDを生成"""
    speech_id = record.get("speechID", "")
    if speech_id:
        return speech_id
    # フォールバック
    issue_id = record.get("issueID", "unknown")
    key = f"{issue_id}-{record.get('speechOrder', 0)}"
    return key


def record_to_meeting(record: dict) -> dict:
    """API レコード → meetings テーブル（idは含めない、DBに任せる）"""
    return {
        "issue_id": record.get("issueID", ""),
        "session": int(record.get("session", 0)) if record.get("session") else None,
        "house": record.get("nameOfHouse", ""),
        "meeting_name": record.get("nameOfMeeting", ""),
        "issue_number": record.get("issue", ""),
        "date": record.get("date", ""),
        "meeting_url": record.get("meetingURL", ""),
    }


def record_to_speech(record: dict, issue_id_to_meeting_id: dict) -> dict | None:
    """API レコード → speeches テーブル
    meeting_id はDBの実値を使う（uuid5やmd5ではなく）
    """
    issue_id = record.get("issueID", "")
    meeting_id = issue_id_to_meeting_id.get(issue_id)
    if not meeting_id:
        print(f"  WARNING: issue_id={issue_id} のmeetingが見つからない、スキップ")
        return None

    return {
        "speech_id": make_speech_id(record),
        "meeting_id": meeting_id,  # ★ DBの実際のIDを使用
        "speech_order": int(record.get("speechOrder", 0)) if record.get("speechOrder") else None,
        "speaker_name": record.get("speaker", ""),
        "speaker_group": record.get("speakerGroup", ""),
        "speaker_position": record.get("speakerPosition", ""),
        "content": record.get("speech", ""),
        "speech_url": record.get("speechURL", ""),
        "date": record.get("date", ""),
    }


def record_to_legislator(record: dict) -> dict | None:
    """API レコード → legislators テーブル"""
    name = record.get("speaker", "").strip()
    if not name:
        return None

    group = record.get("speakerGroup", "")
    position = record.get("speakerPosition", "")
    date = record.get("date", "")
    house = record.get("nameOfHouse", "")
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

def upsert_meetings(meetings: list[dict]) -> dict:
    """
    会議を upsert し、issue_id → meetings.id のマッピングを返す。
    既存行はスキップ（idを変更しない）。
    """
    if not meetings:
        return {}

    # 重複除去（issue_id ベース）
    seen = {}
    for m in meetings:
        if m["issue_id"]:
            seen[m["issue_id"]] = m
    unique = list(seen.values())

    # INSERT ... ON CONFLICT DO NOTHING
    batch_size = 500
    for i in range(0, len(unique), batch_size):
        batch = unique[i:i + batch_size]
        supabase.table("meetings").upsert(
            batch, on_conflict="issue_id", ignore_duplicates=True
        ).execute()
    print(f"  会議: {len(unique)}件 upserted")

    # ★ DBから実際の issue_id → id マッピングを取得
    issue_ids = list(seen.keys())
    issue_id_to_meeting_id = {}

    chunk_size = 200  # PostgREST IN句の制限対策
    for i in range(0, len(issue_ids), chunk_size):
        chunk = issue_ids[i:i + chunk_size]
        result = supabase.table("meetings") \
            .select("id, issue_id") \
            .in_("issue_id", chunk) \
            .execute()
        for row in (result.data or []):
            issue_id_to_meeting_id[row["issue_id"]] = row["id"]

    print(f"  マッピング取得: {len(issue_id_to_meeting_id)}件")
    return issue_id_to_meeting_id


def upsert_speeches(speeches: list[dict]):
    """発言を upsert（speech_id UNIQUE制約で冪等）"""
    if not speeches:
        return

    # 重複除去
    seen = {}
    for s in speeches:
        seen[s["speech_id"]] = s
    unique = list(seen.values())

    # upsert: speech_id が既に存在すればスキップ
    batch_size = 200
    inserted = 0
    for i in range(0, len(unique), batch_size):
        batch = unique[i:i + batch_size]
        supabase.table("speeches").upsert(
            batch, on_conflict="speech_id", ignore_duplicates=True
        ).execute()
        inserted += len(batch)
    print(f"  発言: {len(unique)}件 upserted")


def upsert_legislators(legislators: list[dict]):
    """議員を upsert"""
    if not legislators:
        return

    by_name = {}
    for leg in legislators:
        name = leg["name"]
        if name not in by_name or (leg.get("last_seen", "") > by_name[name].get("last_seen", "")):
            by_name[name] = leg

    existing = {}
    result = supabase.table("legislators").select("id, name, last_seen").execute()
    for r in (result.data or []):
        existing[r["name"]] = r

    new_count = 0
    update_count = 0

    for name, leg in by_name.items():
        if name in existing:
            ex = existing[name]
            if leg.get("last_seen", "") > (ex.get("last_seen") or ""):
                supabase.table("legislators").update({
                    "last_seen": leg["last_seen"],
                    "current_party": leg["current_party"],
                }).eq("id", ex["id"]).execute()
                update_count += 1
        else:
            supabase.table("legislators").insert(leg).execute()
            new_count += 1

    print(f"  議員: 新規{new_count}件, 更新{update_count}件")

    link_legislators_to_speeches()


def link_legislators_to_speeches():
    """legislator_id が NULL の speeches に議員をリンク"""
    result = supabase.table("speeches").select("id, speaker_name").is_("legislator_id", "null").limit(1000).execute()
    unlinked = result.data or []
    if not unlinked:
        return

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

    if args.from_date and args.until_date:
        from_date = args.from_date
        until_date = args.until_date
    else:
        latest = get_latest_date()
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

    # データ変換（meetingsは先に処理）
    meetings_data = [record_to_meeting(r) for r in records]
    legislators_raw = [record_to_legislator(r) for r in records]
    legislators = [l for l in legislators_raw if l is not None]

    print()
    print("--- Supabase 書き込み ---")

    # ★ Step 1: meetings upsert → マッピング取得
    issue_id_to_meeting_id = upsert_meetings(meetings_data)

    # ★ Step 2: speeches変換（DBの実際のmeeting_idを使用）
    speeches = []
    skipped = 0
    for r in records:
        sp = record_to_speech(r, issue_id_to_meeting_id)
        if sp:
            speeches.append(sp)
        else:
            skipped += 1
    if skipped:
        print(f"  WARNING: {skipped}件の発言がmeetingマッピング欠損でスキップ")

    # ★ Step 3: speeches upsert
    upsert_speeches(speeches)

    # Step 4: legislators
    upsert_legislators(legislators)

    print()
    print("完了!")
    print(f"  会議: {len(set(m['issue_id'] for m in meetings_data if m['issue_id']))}件")
    print(f"  発言: {len(speeches)}件")
    print(f"  発言者: {len(set(l['name'] for l in legislators))}人")


if __name__ == "__main__":
    main()
