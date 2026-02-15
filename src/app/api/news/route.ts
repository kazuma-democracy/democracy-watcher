import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  if (!query) {
    return NextResponse.json({ articles: [], error: 'Missing query' }, { status: 400 })
  }

  try {
    // Google News RSS feed
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 }, // 1時間キャッシュ
    })

    if (!res.ok) {
      return NextResponse.json({ articles: [], error: `RSS fetch failed: ${res.status}` })
    }

    const xml = await res.text()

    // XMLからitemを抽出（軽量パース）
    const items: { title: string; url: string; source: string; date: string }[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const block = match[1]
      const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')?.trim() || ''
      const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
        || block.match(/<link[^>]*href="([^"]*)"[^>]*>/)?.[1]?.trim() || ''
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || ''
      const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')?.trim() || ''

      // タイトルからソース名を除去（Google Newsは「タイトル - ソース名」形式）
      const cleanTitle = title.replace(new RegExp(`\\s*-\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '')

      if (cleanTitle && link) {
        // 日付をフォーマット
        let dateStr = ''
        try {
          const d = new Date(pubDate)
          dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
        } catch {
          dateStr = pubDate
        }

        items.push({
          title: cleanTitle,
          url: link,
          source: source,
          date: dateStr,
        })
      }
    }

    return NextResponse.json({ articles: items })
  } catch (e: unknown) {
    return NextResponse.json({
      articles: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    })
  }
}
