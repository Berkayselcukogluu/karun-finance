"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Header } from "./header"
import { WatchlistTable } from "./watchlist-table"
import { HoldingsTable } from "./holdings-table"
import { OverviewPanels } from "./overview-panels"

import { NewsCard } from "./news-card"
import type { Stock, MarketStatus, Holding } from "@/lib/stock-types"

import { useNavigate } from "react-router-dom"

// Raw holding type returned from the API
interface HoldingRaw {
  id: number
  symbol: string
  quantity: number
  average_price: number
  added_at: string
}

function LoadingSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-transparent">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-lg font-medium text-foreground">Loading Market Data...</p>
      </div>
    </div>
  )
}

export function StockTickerPage() {
  const navigate = useNavigate()
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [stocks, setStocks] = useState<Stock[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [holdingsRaw, setHoldingsRaw] = useState<HoldingRaw[]>([])
  const [cashBalance, setCashBalance] = useState(0)
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([])
  const [isLive, setIsLive] = useState(false)
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Get userId from localStorage, default to null if not found
  const [userId] = useState<string | null>(localStorage.getItem("userId"))

  const isFirstLoad = useRef(true)

  // Combined Initial Data Fetch
  useEffect(() => {
    if (!userId) {
      navigate("/login")
      return
    }

    const loadInitialData = async () => {
      try {
        console.log("[Data Load] Starting initial data fetch...")

        // 1. Fetch Market Status first to determine if we are live
        const statusResp = await fetch("/api/market-status")
        let currentStatus: MarketStatus | null = null
        if (statusResp.ok) {
          currentStatus = await statusResp.json()
          setMarketStatus(currentStatus)
        }

        // 2. Fetch User Data (Parallel)
        const [watchlistResp, holdingsResp, cashResp] = await Promise.all([
          fetch(`/api/watchlist/${userId}`),
          fetch(`/api/holdings/${userId}`),
          fetch(`/api/cash/${userId}`)
        ])

        let fetchedWatchlist: string[] = []
        let fetchedHoldingsRaw: HoldingRaw[] = []

        if (watchlistResp.ok) {
          fetchedWatchlist = await watchlistResp.json()
          setWatchlistSymbols(fetchedWatchlist)
        }

        if (holdingsResp.ok) {
          fetchedHoldingsRaw = await holdingsResp.json()
          setHoldingsRaw(fetchedHoldingsRaw)
        }

        if (cashResp.ok) {
          const cashData = await cashResp.json()
          setCashBalance(cashData.amount || 0)
        }

        // 3. Update IsLive Logic based on fetched status
        if (currentStatus) {
          const session = currentStatus.session?.toLowerCase()
          const reason = currentStatus.reason?.toLowerCase()

          const isPreOrPost = session?.includes("pre") || session?.includes("post")
          const isHoliday = reason?.includes("holiday") || reason?.includes("weekend")

          const shouldBeLive = currentStatus.isOpen && !isPreOrPost && !isHoliday
          setIsLive(shouldBeLive)
          console.log(`[Market Status] Open: ${currentStatus.isOpen}, Session: ${session}, Live Mode: ${shouldBeLive}`)
        }

        // 4. Initial Stock Quote Fetch (Once)
        const holdingSymbols = fetchedHoldingsRaw.map(h => h.symbol)
        const allSymbols = [...new Set([...fetchedWatchlist, ...holdingSymbols])]

        if (allSymbols.length > 0) {
          await fetchQuotes(allSymbols, fetchedWatchlist, fetchedHoldingsRaw)
        }

      } catch (error) {
        console.error("Failed to load initial data", error)
      } finally {
        setIsLoading(false)
        isFirstLoad.current = false
      }
    }

    if (isFirstLoad.current) {
      loadInitialData()
    }
  }, [userId, navigate])

  // Helper function to fetch quotes and update state
  const fetchQuotes = async (symbols: string[], currentWatchlist: string[], currentHoldingsRaw: HoldingRaw[]) => {
    if (symbols.length === 0) return

    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(symbols)
      })
      const data = await response.json()

      // Update Stocks
      setStocks(prevStocks => {
        return currentWatchlist.map((symbol) => {
          const item = data[symbol] || {}
          const previousStock = prevStocks.find(s => s.symbol === symbol)

          const price = (item.price && item.price > 0) ? item.price : (previousStock?.price || 0)
          const prevClose = (item.prev_close && item.prev_close > 0) ? item.prev_close : (previousStock?.prevClose || price)
          const change = price - prevClose
          const changePercent = prevClose ? (change / prevClose) * 100 : 0
          const direction = change > 0.001 ? "up" : change < -0.001 ? "down" : "flat"

          return {
            id: symbol,
            symbol: symbol,
            name: symbol,
            price: price,
            prevClose: prevClose,
            change: change,
            changePercent: changePercent,
            direction: direction,
          }
        })
      })

      // Update Holdings
      setHoldings(prevHoldings => {
        return currentHoldingsRaw.map((raw) => {
          const item = data[raw.symbol] || {}
          const previousHolding = prevHoldings.find(h => h.symbol === raw.symbol)

          const currentPrice = (item.price && item.price > 0) ? item.price : (previousHolding?.currentPrice || 0)
          const prevClose = (item.prev_close && item.prev_close > 0) ? item.prev_close : (previousHolding?.prevClose || currentPrice)

          const dailyChange = currentPrice - prevClose
          const dailyChangePercent = prevClose ? (dailyChange / prevClose) * 100 : 0
          const dailyDirection = dailyChange > 0.001 ? "up" : dailyChange < -0.001 ? "down" : "flat"

          const totalValue = currentPrice * raw.quantity
          const totalCost = raw.average_price * raw.quantity
          const totalChange = totalValue - totalCost
          const totalChangePercent = totalCost > 0 ? (totalChange / totalCost) * 100 : 0
          const direction = totalChange > 0.001 ? "up" : totalChange < -0.001 ? "down" : "flat"

          return {
            id: raw.id.toString(),
            symbol: raw.symbol,
            name: raw.symbol,
            quantity: raw.quantity,
            averagePrice: raw.average_price,
            currentPrice: currentPrice,
            prevClose: prevClose,
            dailyChange: dailyChange,
            dailyChangePercent: dailyChangePercent,
            dailyDirection: dailyDirection as "up" | "down" | "flat",
            totalValue: totalValue,
            totalCost: totalCost,
            totalChange: totalChange,
            totalChangePercent: totalChangePercent,
            direction: direction,
          }
        })
      })

    } catch (error) {
      console.error("Failed to fetch quotes", error)
    }
  }

  // Polling Effect
  useEffect(() => {
    if (!isLive) return

    const pollData = () => {
      const holdingSymbols = holdingsRaw.map(h => h.symbol)
      const allSymbols = [...new Set([...watchlistSymbols, ...holdingSymbols])]
      if (allSymbols.length > 0) {
        fetchQuotes(allSymbols, watchlistSymbols, holdingsRaw)
      }
    }

    const interval = setInterval(pollData, 20000)
    return () => clearInterval(interval)
  }, [isLive, watchlistSymbols, holdingsRaw])

  // Market Status Polling (Every 5 minutes)
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/market-status")
        if (response.ok) {
          const status: MarketStatus = await response.json()
          setMarketStatus(status)

          const session = status.session?.toLowerCase()
          const reason = status.reason?.toLowerCase()
          const isPreOrPost = session?.includes("pre") || session?.includes("post")
          const isHoliday = reason?.includes("holiday") || reason?.includes("weekend")
          const shouldBeLive = status.isOpen && !isPreOrPost && !isHoliday

          if (isLive !== shouldBeLive) {
            setIsLive(shouldBeLive)
            console.log(`[Status Update] Switching Live Mode to: ${shouldBeLive}`)
          }
        }
      } catch (error) {
        console.error("Failed to update market status", error)
      }
    }

    const interval = setInterval(fetchStatus, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isLive])

  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  const addStock = useCallback(async (symbol: string, _name: string) => {
    if (!watchlistSymbols.includes(symbol)) {
      try {
        const response = await fetch(`/api/watchlist/${userId}?symbol=${symbol}`, {
          method: 'POST'
        })
        if (response.ok) {
          const newWatchlist = [...watchlistSymbols, symbol]
          setWatchlistSymbols(newWatchlist)
          fetchQuotes(newWatchlist, newWatchlist, holdingsRaw)
        }
      } catch (error) {
        console.error("Failed to add stock", error)
      }
    }
  }, [watchlistSymbols, holdingsRaw, userId])

  const removeStock = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/watchlist/${userId}/${id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setWatchlistSymbols(prev => prev.filter(s => s !== id))
        setStocks(prev => prev.filter(s => s.symbol !== id))
      }
    } catch (error) {
      console.error("Failed to remove stock", error)
    }
  }, [userId])

  // Holdings CRUD operations
  const addHolding = useCallback(async (symbol: string, quantity: number, averagePrice: number) => {
    try {
      const response = await fetch(`/api/holdings/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          symbol: symbol,
          quantity: quantity,
          average_price: averagePrice
        })
      })
      if (response.ok) {
        // Reload holdings list after adding or updating a holding
        const holdingsResponse = await fetch(`/api/holdings/${userId}`)
        if (holdingsResponse.ok) {
          const data: HoldingRaw[] = await holdingsResponse.json()
          setHoldingsRaw(data)
          fetchQuotes([...new Set([...watchlistSymbols, data.map(h => h.symbol).join(',')].join(',').split(','))], watchlistSymbols, data)
        }
      }
    } catch (error) {
      console.error("Failed to add holding", error)
    }
  }, [userId, watchlistSymbols])

  // Update existing holding (quantity or average price)
  const updateHolding = useCallback(async (symbol: string, quantity: number, averagePrice: number) => {
    try {
      const response = await fetch(`/api/holdings/${userId}/${symbol}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quantity: quantity,
          average_price: averagePrice
        })
      })
      if (response.ok) {
        setHoldingsRaw(prev => prev.map(h =>
          h.symbol === symbol ? { ...h, quantity, average_price: averagePrice } : h
        ))

        setHoldings(prev => prev.map(h => {
          if (h.symbol === symbol) {
            const totalValue = h.currentPrice * quantity
            const totalCost = averagePrice * quantity
            const totalChange = totalValue - totalCost
            const totalChangePercent = totalCost > 0 ? (totalChange / totalCost) * 100 : 0

            return {
              ...h,
              quantity,
              averagePrice,
              totalValue,
              totalCost,
              totalChange,
              totalChangePercent
            }
          }
          return h
        }))
      }
    } catch (error) {
      console.error("Failed to update holding", error)
    }
  }, [userId])

  const removeHolding = useCallback(async (symbol: string) => {
    try {
      const response = await fetch(`/api/holdings/${userId}/${symbol}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setHoldingsRaw(prev => prev.filter(h => h.symbol !== symbol))
        setHoldings(prev => prev.filter(h => h.symbol !== symbol))
      }
    } catch (error) {
      console.error("Failed to remove holding", error)
    }
  }, [userId])

  // Update cash balance
  const updateCash = useCallback(async (amount: number) => {
    try {
      const response = await fetch(`/api/cash/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount })
      })

      if (response.ok) {
        setCashBalance(amount)
      }
    } catch (error) {
      console.error("Failed to update cash", error)
    }
  }, [userId])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev)
  }, [])

  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="dark">
      <div className="text-foreground transition-colors duration-300 pb-8 min-h-screen bg-transparent">
        <Header
          theme="dark"
          soundEnabled={soundEnabled}
          onToggleTheme={() => { }}
          onToggleSound={toggleSound}
          marketStatus={marketStatus}
          marketType="nasdaq"
        />
        <main className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <WatchlistTable
                stocks={stocks}
                onAddStock={addStock}
                onRemoveStock={removeStock}
                soundEnabled={soundEnabled}
              />
              <HoldingsTable
                holdings={holdings}
                cashBalance={cashBalance}
                onAddHolding={addHolding}
                onRemoveHolding={removeHolding}
                onUpdateCash={updateCash}
                onUpdateHolding={updateHolding}
                soundEnabled={soundEnabled}
              />
              {/* News Section */}
              <NewsCard
                watchlistSymbols={watchlistSymbols}
                holdingSymbols={holdingsRaw.map(h => h.symbol)}
              />
            </div>
            <div className="lg:col-span-1">
              <OverviewPanels stocks={stocks} holdings={holdings} />
            </div>
          </div>
        </main>

      </div>
    </div>
  )
}
