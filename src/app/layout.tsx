import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Democracy Watcher - 民主主義ウォッチャー',
  description: '国会議員の活動を市民の力で見守るプラットフォーム',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        {/* ヘッダー */}
        <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-2xl">🏛️</span>
              <div>
                <h1 className="text-lg font-bold text-slate-100 leading-tight">
                  Democracy Watcher
                </h1>
                <p className="text-xs text-slate-400">民主主義ウォッチャー</p>
              </div>
            </a>
            <nav className="flex items-center gap-4 text-sm">
              <a href="/legislators" className="text-slate-300 hover:text-white transition-colors">
                議員一覧
              </a>
              <a href="/meetings" className="text-slate-300 hover:text-white transition-colors">
                会議一覧
              </a>
              <a href="/bills" className="text-slate-300 hover:text-white transition-colors">
                議案・採決
              </a>
              <a href="/compare" className="text-slate-300 hover:text-white transition-colors">
                議員比較
              </a>
              <a href="/rankings" className="text-slate-300 hover:text-white transition-colors">
                ランキング
              </a>
              <a href="/committee" className="text-slate-300 hover:text-white transition-colors">
                委員会
              </a>
              <a href="/stats" className="text-slate-300 hover:text-white transition-colors">
                統計
              </a>
              <a href="/analysis" className="text-slate-300 hover:text-white transition-colors">
                分析
              </a>
              <a href="/scandals" className="text-red-400/80 hover:text-red-300 transition-colors">
                不祥事
              </a>
            </nav>
          </div>
        </header>

        {/* メインコンテンツ */}
        <main>
          {children}
        </main>

        {/* フッター */}
        <footer className="border-t border-slate-700/50 mt-16 py-8">
          <div className="max-w-6xl mx-auto px-4 text-center text-sm text-slate-500">
            <p>Democracy Watcher - 民主主義は、見守る人がいて初めて機能する</p>
            <p className="mt-1">
              出典：
              <a href="https://kokkai.ndl.go.jp/" target="_blank" rel="noopener" className="underline hover:text-slate-300">
                国立国会図書館 国会会議録検索システム
              </a>
              {' '}／{' '}
              <a href="https://smartnews-smri.github.io/house-of-representatives/" target="_blank" rel="noopener" className="underline hover:text-slate-300">
                スマートニュース メディア研究所
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
