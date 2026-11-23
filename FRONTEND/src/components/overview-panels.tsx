"use client"

import type React from "react"

import { useMemo, useState, useEffect } from "react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Stock, Holding } from "@/lib/stock-types"
import { Link } from "react-router-dom"
import { MAG7Card } from "./mag7-card"

interface IndexData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  direction: "up" | "down" | "flat"
}

interface OverviewPanelsProps {
  stocks: Stock[]
  holdings?: Holding[]
}

export function OverviewPanels({ stocks, holdings = [] }: OverviewPanelsProps) {
  const [indices, setIndices] = useState<IndexData[]>([])

  // Fetch market indices
  useEffect(() => {
    const fetchIndices = async () => {
      try {
        const response = await fetch('/api/indices')
        if (response.ok) {
          const data = await response.json()
          setIndices(data)
        }
      } catch (error) {
        console.error("Failed to fetch indices", error)
      }
    }
    
    fetchIndices()
    // Refresh every 20 seconds
    const interval = setInterval(fetchIndices, 20000)
    return () => clearInterval(interval)
  }, [])

  // Convert holdings to Stock-like format for display (using DAILY change, not P/L)
  const holdingsAsStocks: Stock[] = holdings.map(h => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    price: h.currentPrice,
    prevClose: h.prevClose,
    change: h.dailyChange,
    changePercent: h.dailyChangePercent,
    direction: h.dailyDirection,
  }))
  
  // Combine stocks and holdings, avoiding duplicates (prefer watchlist if exists)
  const watchlistSymbols = new Set(stocks.map(s => s.symbol))
  const uniqueHoldings = holdingsAsStocks.filter(h => !watchlistSymbols.has(h.symbol))
  const combinedStocks = [...stocks, ...uniqueHoldings]
  const topGainers = useMemo(() => {
    return [...combinedStocks]
      .filter((s) => s.direction === "up")
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5)
  }, [combinedStocks])

  const topLosers = useMemo(() => {
    return [...combinedStocks]
      .filter((s) => s.direction === "down")
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5)
  }, [combinedStocks])

  return (
    <div className="space-y-4">
      <MAG7Card />
      <OverviewCard
        title="Top Gainers"
        icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
        stocks={topGainers}
        emptyMessage="No gainers yet"
        accentColor="emerald"
      />
      <OverviewCard
        title="Top Losers"
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        stocks={topLosers}
        emptyMessage="No losers yet"
        accentColor="red"
      />
      <IndicesCard
        title="Market Indices"
        icon={<BarChart3 className="h-4 w-4 text-purple-500" />}
        indices={indices}
        emptyMessage="Loading indices..."
        accentColor="purple"
      />
    </div>
  )
}

function OverviewCard({
  title,
  icon,
  stocks,
  emptyMessage,
  accentColor,
}: {
  title: string
  icon: React.ReactNode
  stocks: Stock[]
  emptyMessage: string
  accentColor: "emerald" | "red" | "blue"
}) {
  const gradientClass = {
    emerald: "from-emerald-500 via-emerald-500/20 to-transparent",
    red: "from-red-500 via-red-500/20 to-transparent",
    blue: "from-blue-500 via-blue-500/20 to-transparent",
  }[accentColor]

  const rowHighlightClass = {
    emerald: "hover:bg-emerald-500/15",
    red: "hover:bg-red-500/15",
    blue: "hover:bg-blue-500/15",
  }[accentColor]

  return (
    <div className="relative rounded-lg p-[1px] bg-border transition-transform duration-500 ease-in-out hover:scale-105 group">
      <div
        className={cn(
          "absolute inset-0 rounded-lg bg-gradient-to-bl opacity-80 transition-all duration-500 ease-in-out",
          gradientClass,
        )}
        style={{
          maskImage: "linear-gradient(135deg, black 0%, transparent 50%)",
          WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 50%)",
        }}
      />
      <div
        className={cn(
          "absolute inset-0 rounded-lg bg-gradient-to-bl opacity-0 group-hover:opacity-80 transition-opacity duration-500 ease-in-out",
          gradientClass,
        )}
        style={{
          maskImage: "linear-gradient(135deg, black 0%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 70%)",
        }}
      />
      <div className="relative rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {stocks.length > 0 ? (
            <ul className="space-y-2">
              {stocks.map((stock) => (
                <li key={stock.id}>
                  <Link
                    to={`/${stock.symbol}`}
                    className={cn(
                      "flex items-center justify-between py-1.5 px-2 rounded-md transition-colors",
                      rowHighlightClass,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">{stock.symbol}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-muted-foreground tabular-nums font-light">
                        ${stock.price.toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-light tabular-nums min-w-[60px] text-right",
                          stock.direction === "up" && "text-emerald-500",
                          stock.direction === "down" && "text-red-500",
                          stock.direction === "flat" && "text-muted-foreground",
                        )}
                      >
                        {stock.changePercent >= 0 ? "+" : ""}
                        {stock.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
          )}
        </CardContent>
      </div>
    </div>
  )
}

function IndicesCard({
  title,
  icon,
  indices,
  emptyMessage,
}: {
  title: string
  icon: React.ReactNode
  indices: IndexData[]
  emptyMessage: string
  accentColor?: "emerald" | "red" | "blue" | "purple"
}) {
  const gradientClass = "from-purple-500 via-purple-500/20 to-transparent"
  const rowHighlightClass = "hover:bg-purple-500/15"

  return (
    <div className="relative rounded-lg p-[1px] bg-border transition-transform duration-500 ease-in-out hover:scale-105 group">
      <div
        className={cn(
          "absolute inset-0 rounded-lg bg-gradient-to-bl opacity-80 transition-all duration-500 ease-in-out",
          gradientClass,
        )}
        style={{
          maskImage: "linear-gradient(135deg, black 0%, transparent 50%)",
          WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 50%)",
        }}
      />
      <div
        className={cn(
          "absolute inset-0 rounded-lg bg-gradient-to-bl opacity-0 group-hover:opacity-80 transition-opacity duration-500 ease-in-out",
          gradientClass,
        )}
        style={{
          maskImage: "linear-gradient(135deg, black 0%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 70%)",
        }}  
      />
      <div className="relative rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {indices.length > 0 ? (
            <ul className="space-y-2">
              {indices.map((index) => (
                <li key={index.symbol}>
                  <div
                    className={cn(
                      "flex items-center justify-between py-1.5 px-2 rounded-md transition-colors",
                      rowHighlightClass,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{index.name.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-muted-foreground tabular-nums font-light">
                        {index.symbol === "BTC-USD" ? "$" : ""}{index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-light tabular-nums min-w-[60px] text-right",
                          index.direction === "up" && "text-emerald-500",
                          index.direction === "down" && "text-red-500",
                          index.direction === "flat" && "text-muted-foreground",
                        )}
                      >
                        {index.changePercent >= 0 ? "+" : ""}
                        {index.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
          )}
        </CardContent>
      </div>
    </div>
  )
}
