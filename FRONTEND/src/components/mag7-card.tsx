"use client"

import { useState, useEffect } from "react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Link } from "react-router-dom"

interface MAG7Stock {
  symbol: string
  name: string
  price: number
  prevClose?: number
  change: number
  changePercent: number
  direction: "up" | "down" | "flat"
}

const MAG7_COMPANIES = [
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta" },
  { symbol: "NVDA", name: "Nvidia" },
  { symbol: "TSLA", name: "Tesla" },
]

export function MAG7Card() {
  const [mag7Stocks, setMag7Stocks] = useState<MAG7Stock[]>([])

  useEffect(() => {
    const fetchMAG7Data = async () => {
      try {
        const symbols = MAG7_COMPANIES.map(c => c.symbol)
        const response = await fetch('/api/quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(symbols)
        })

        if (response.ok) {
          const data = await response.json()

          setMag7Stocks(prevStocks => {
            return MAG7_COMPANIES.map((company) => {
              const item = data[company.symbol] || {}
              const previousStock = prevStocks.find(s => s.symbol === company.symbol)

              // Update only when a valid price is returned; otherwise retain previous value
              const price = (item.price && item.price > 0) ? item.price : (previousStock?.price || 0)
              const prevClose = (item.prev_close && item.prev_close > 0) ? item.prev_close : (previousStock?.prevClose || price)
              const change = price - prevClose
              const changePercent = prevClose ? (change / prevClose) * 100 : 0
              const direction = change > 0.001 ? "up" : change < -0.001 ? "down" : "flat"

              return {
                symbol: company.symbol,
                name: company.name,
                price: price,
                prevClose: prevClose,
                change: change,
                changePercent: changePercent,
                direction: direction,
              }
            })
          })
        }
      } catch (error) {
        console.error("Failed to fetch MAG7 data", error)
      }
    }

    fetchMAG7Data()
    // Refresh every 20 seconds
    const interval = setInterval(fetchMAG7Data, 20000)
    return () => clearInterval(interval)
  }, [])

  const gradientClass = "from-blue-500 via-blue-500/20 to-transparent"
  const rowHighlightClass = "hover:bg-blue-500/15"

  return (
    <div className="relative rounded-lg p-[1px] bg-border transition-transform duration-500 ease-in-out hover:scale-105 group">
      {/* Base gradient effect */}
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
      {/* Hover gradient effect */}
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
      {/* Card content */}
      <div className="relative rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
            <Zap className="h-4 w-4 text-blue-500" />
            MAG7 - Magnificent Seven
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {mag7Stocks.length > 0 ? (
            <ul className="space-y-2">
              {mag7Stocks.map((stock) => (
                <li key={stock.symbol}>
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
            <p className="text-sm text-muted-foreground text-center py-4">Loading MAG7...</p>
          )}
        </CardContent>
      </div>
    </div>
  )
}
