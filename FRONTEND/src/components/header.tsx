"use client"

import { useState, useEffect } from "react"
import { Moon, Sun } from "lucide-react"
import { PlaceholdersAndVanishInput } from "./ui/placeholders-and-vanish-input"
import { useNavigate } from "react-router-dom"
import { MarketStatus } from "@/lib/stock-types"

interface HeaderProps {
  theme: "dark" | "light"
  onToggleTheme: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  marketStatus?: MarketStatus | null
  marketType?: "nasdaq"
}

export function Header({ marketStatus }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const navigate = useNavigate()
  const [searchResult, setSearchResult] = useState<{ symbol: string, price: number } | null>(null)
  const [searchValue, setSearchValue] = useState("")

  const placeholders = [
    "Search for AAPL...",
    "Check NVDA price...",
    "Look up TSLA...",
    "Find MSFT...",
    "Search symbols...",
  ]

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)

    if (value.length >= 2) {
        try {
            const upperSymbol = value.toUpperCase()
            const response = await fetch(`/api/quote/${upperSymbol}`)
            if (response.ok) {
                const data = await response.json()
                if (data.price) {
                    setSearchResult({ symbol: upperSymbol, price: data.price })
                } else {
                    setSearchResult(null)
                }
            } else {
                setSearchResult(null)
            }
        } catch {
            setSearchResult(null)
        }
    } else {
        setSearchResult(null)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (searchValue) {
        const upperSymbol = searchValue.toUpperCase()
        navigate(`/${upperSymbol}`)
        setSearchResult(null)
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const getStatusBadge = () => {
    if (!marketStatus) return (
        <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-500 border border-gray-500/30">
          LOADING...
        </span>
    );

    if (marketStatus.holiday) {
        return (
            <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/30">
              HOLIDAY
            </span>
        )
    }

    const session = marketStatus.session?.toLowerCase();

    if (session === "pre-market" || session === "pre market") {
        return (
            <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-500 border border-orange-500/30">
              PRE-MARKET
            </span>
        )
    }

    if (session === "post-market" || session === "post market") {
        return (
            <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-500 border border-purple-500/30">
              POST-MARKET
            </span>
        )
    }
    
    if (marketStatus.isOpen) {
         return (
            <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
              LIVE
            </span>
          )
    }

    return (
        <span className="hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
          CLOSED
        </span>
    )
  }

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-foreground select-none cursor-default">
            MarketBoard
          </span>
          {getStatusBadge()}
        </div>

        <div className="flex-1 max-w-md mx-4 relative hidden md:block">
            <PlaceholdersAndVanishInput
                placeholders={placeholders}
                onChange={handleSearchChange}
                onSubmit={handleSearchSubmit}
            />
            {searchResult && (
                <div
                    className="absolute top-full left-0 right-0 mt-2 bg-[#0A0A0A]/95 backdrop-blur-md border border-white/[0.12] rounded-lg shadow-2xl p-3 cursor-pointer hover:bg-[#1A1A1A]/95 transition-all z-50"
                    onClick={() => {
                        navigate(`/${searchResult.symbol}`)
                        setSearchResult(null)
                        setSearchValue("")
                    }}
                >
                    <div className="flex justify-between items-center gap-4">
                        <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-white">{searchResult.symbol}</span>
                            <span className="text-xs text-muted-foreground">US Market</span>
                        </div>
                        <span className="text-lg font-mono font-semibold text-emerald-500">
                            ${searchResult.price.toFixed(2)}
                        </span>
                    </div>
                </div>
            )}
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end text-sm font-mono">
            <span className="text-muted-foreground text-xs">{formatDate(currentTime)}</span>
            <span className="text-foreground tabular-nums">{formatTime(currentTime)}</span>
          </div>

          <div className="h-8 w-8 flex items-center justify-center">
            {currentTime.getHours() >= 6 && currentTime.getHours() < 18 ? (
              <Sun className="h-4 w-4 text-white" />
            ) : (
              <Moon className="h-4 w-4 text-white" />
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

