"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Newspaper, ExternalLink, RefreshCw, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface NewsItem {
  id: number
  symbol: string
  finnhub_id: number
  headline: string
  summary: string
  source: string
  url: string
  image_url: string
  published_at: string
  category: string
  related: string
}

interface NewsCardProps {
  watchlistSymbols: string[]
  holdingSymbols: string[]
}

export function NewsCard({ watchlistSymbols, holdingSymbols }: NewsCardProps) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)

  // Combine and dedupe symbols
  const allSymbols = [...new Set([...watchlistSymbols, ...holdingSymbols])]

  const fetchAndSaveNews = useCallback(async () => {
    if (allSymbols.length === 0) return

    setLoading(true)
    try {
      // First, fetch news from Finnhub and save to DB
      await fetch('/api/news/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allSymbols)
      })

      // Then get news from DB
      const response = await fetch(`/api/news?symbols=${allSymbols.join(',')}&limit=30`)
      if (response.ok) {
        const data = await response.json()
        setNews(data)
        setLastFetched(new Date())
      }
    } catch (error) {
      console.error("Failed to fetch news", error)
    } finally {
      setLoading(false)
    }
  }, [allSymbols.join(',')])

  // Fetch on mount and every 15 minutes
  useEffect(() => {
    fetchAndSaveNews()

    const interval = setInterval(() => {
      fetchAndSaveNews()
    }, 15 * 60 * 1000) // 15 minutes

    return () => clearInterval(interval)
  }, [fetchAndSaveNews])

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const displayedNews = showAll ? news : news.slice(0, 4)

  // Check if symbol is in holdings (for purple color)
  const isHoldingSymbol = (symbol: string) => holdingSymbols.includes(symbol)

  if (allSymbols.length === 0) return null

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-foreground">Market News</h2>
          {news.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {news.length} articles
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(lastFetched.toISOString())}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchAndSaveNews}
            disabled={loading}
            className="h-8 w-8"
            aria-label="Refresh news"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8"
            aria-label={expanded ? "Collapse news" : "Expand news"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {loading && news.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading news...
              </div>
            ) : news.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Newspaper className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No news found for your symbols</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {displayedNews.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                    >
                      <div className="relative rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:bg-card/50 hover:border-border hover:shadow-lg hover:scale-[1.02]">
                        {/* Image with fallback */}
                        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.headline}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              onError={(e) => {
                                // Show placeholder if image fails to load
                                const target = e.target as HTMLImageElement
                                target.onerror = null // Prevent infinite loop
                                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.symbol)}&background=3b82f6&color=fff&size=400&bold=true&format=svg`
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-3xl font-bold text-white/30">{item.symbol}</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                        </div>

                        {/* Content */}
                        <div className="p-3">
                          {/* Symbol & Time */}
                          <div className="flex items-center justify-between mb-2">
                            <span className={cn(
                              "text-xs font-mono font-semibold px-2 py-0.5 rounded",
                              isHoldingSymbol(item.symbol)
                                ? "text-purple-500 bg-purple-500/10"
                                : "text-blue-500 bg-blue-500/10"
                            )}>
                              {item.symbol}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimeAgo(item.published_at)}
                            </span>
                          </div>

                          {/* Headline */}
                          <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-2 group-hover:text-blue-400 transition-colors">
                            {item.headline}
                          </h3>

                          {/* Summary */}
                          {item.summary && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {item.summary}
                            </p>
                          )}

                          {/* Source */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground/70">
                              {item.source}
                            </span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>

                {news.length > 4 && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAll(!showAll)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showAll ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Show All ({news.length})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
