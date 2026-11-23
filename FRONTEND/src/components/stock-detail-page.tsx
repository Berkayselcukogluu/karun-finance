"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "react-router-dom"
import { Header } from "./header"

import { StockChart } from "./stock-chart"
import { ValuationChart } from "./valuation-chart"
import { FinancialRadarChart } from "./financial-radar-chart"
import MAG7SegmentsPanel from "./mag7-segments-panel"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ArrowLeft, BarChart3, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNavigate } from "react-router-dom"
import { CreateAlertModal } from "./create-alert-modal"
import type { MarketStatus, CompanyProfile } from "@/lib/stock-types"
import { cn } from "@/lib/utils"
import { Link } from "react-router-dom"

interface StockDetail {
  symbol: string
  price: number
  high: number
  low: number
  open: number
  prev_close: number
  timestamp: number
}

interface FinancialData {
  symbol: string
  trailingPE: number | null
  forwardPE: number | null
  priceToBook: number | null
  beta: number | null
  trailingEps: number | null
  dividendYield: number | null
  dividendRate: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  fiftyDayAverage: number | null
  twoHundredDayAverage: number | null
  marketCap: number | null
  bookValue: number | null
  priceToSalesTrailing12Months: number | null
  profitMargins: number | null
  operatingMargins: number | null
  returnOnAssets: number | null
  returnOnEquity: number | null
  revenueGrowth: number | null
  earningsGrowth: number | null
  currentRatio: number | null
  debtToEquity: number | null
  heldPercentInsiders: number | null
  heldPercentInstitutions: number | null
  dividendHistory?: { date: string; amount: number }[]
  institutionalHolders?: { holder: string; shares: number; value: number; pctOut: number }[]
  analystTargets?: { current?: number; low?: number; high?: number; mean?: number; median?: number }
}

interface FMPMarketData {
  symbol: string
  volume: number | null
  avgVolume: number | null
  changesPercentage: number | null
  ceo: string | null
  sector: string | null
  industry: string | null
  companyName: string | null
  exchange: string | null
  marketCap: number | null
  beta: number | null
  image: string | null  // Logo URL from FMP
}

interface FMPFinancials {
  symbol: string
  revenue: number | null
  netIncome: number | null
  ebitda: number | null
  totalAssets: number | null
  totalLiabilities: number | null
  totalEquity: number | null
  cashAndCashEquivalents: number | null
  operatingCashFlow: number | null
  freeCashFlow: number | null
  quickRatio: number | null
  grossMargin: number | null
  grossProfit: number | null
  operatingIncome: number | null
}

export function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const navigate = useNavigate()
  const [stock, setStock] = useState<StockDetail | null>(null)
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [financial, setFinancial] = useState<FinancialData | null>(null)
  const [fmpMarket, setFmpMarket] = useState<FMPMarketData | null>(null)
  const [fmpFinancials, setFmpFinancials] = useState<FMPFinancials | null>(null)
  const [peers, setPeers] = useState<string[]>([])
  const [peerQuotes, setPeerQuotes] = useState<Record<string, StockDetail>>({})
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null)
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false)

  const userId = localStorage.getItem("userId")

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev)
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/market-status")
        if (response.ok) {
          const status: MarketStatus = await response.json()
          setMarketStatus(status)

          // Strict check: Only LIVE if isOpen is true AND not in pre/post market
          const session = status.session?.toLowerCase()
          const isPreOrPost = session === "pre-market" ||
            session === "pre market" ||
            session === "post-market" ||
            session === "post market";

          setIsLive(status.isOpen && !isPreOrPost)
        }
      } catch (error) {
        console.error("Failed to fetch market status", error)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchStockDetail = async () => {
      if (!symbol) return
      try {
        const response = await fetch(`/api/quote/${symbol}`)
        if (response.ok) {
          const data = await response.json()
          setStock(data)
        }
      } catch (error) {
        console.error("Failed to fetch stock detail", error)
      } finally {
        setLoading(false)
      }
    }

    const fetchProfile = async () => {
      if (!symbol) return
      try {
        const response = await fetch(`/api/company-profile/${symbol}`)
        if (response.ok) {
          const data = await response.json()
          setProfile(data)
        }
      } catch (error) {
        console.error("Failed to fetch company profile", error)
      }
    }

    const fetchPeers = async () => {
      if (!symbol) return
      try {
        const response = await fetch(`/api/company-peers/${symbol}`)
        if (response.ok) {
          const data: string[] = await response.json()
          // Limit to 4 peers
          const limitedPeers = data.slice(0, 4)
          setPeers(limitedPeers)

          // Fetch quotes for peers
          if (limitedPeers.length > 0) {
            const quotesResponse = await fetch("/api/quotes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(limitedPeers)
            })
            if (quotesResponse.ok) {
              const quotesData = await quotesResponse.json()
              setPeerQuotes(quotesData)
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch peers", error)
      }
    }

    const fetchFinancial = async () => {
      if (!symbol) return
      try {
        const response = await fetch(`/api/financial/${symbol}`)
        if (response.ok) {
          const data = await response.json()
          setFinancial(data)
        }
      } catch (error) {
        console.error("Failed to fetch financial data", error)
      }
    }

    const fetchFmpMarket = async () => {
      if (!symbol) return
      try {
        const response = await fetch(`/api/fmp/market/${symbol}`)
        if (response.ok) {
          const data = await response.json()
          setFmpMarket(data)
        }
      } catch (error) {
        console.error("Failed to fetch FMP market data", error)
      }
    }

    const fetchFmpFinancials = async () => {
      if (!symbol) return
      try {
        const response = await fetch(`/api/fmp/financials/${symbol}`)
        if (response.ok) {
          const data = await response.json()
          setFmpFinancials(data)
        }
      } catch (error) {
        console.error("Failed to fetch FMP financials", error)
      }
    }

    fetchStockDetail()
    fetchProfile()
    fetchPeers()
    fetchFinancial()
    fetchFmpMarket()
    fetchFmpFinancials()

    // If live, fetch periodically
    let interval: NodeJS.Timeout
    if (isLive) {
      interval = setInterval(fetchStockDetail, 5000)
    }
    return () => clearInterval(interval)
  }, [symbol, isLive, userId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        Loading...
      </div>
    )
  }

  if (!stock) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
        <h1 className="text-2xl font-bold">Stock Not Found</h1>
        <Button onClick={() => navigate("/")}>Go Back</Button>
      </div>
    )
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price)
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const formatFinancialMarketCap = (mcap: number | null | undefined) => {
    if (!mcap) return "N/A"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1
    }).format(mcap)
  }

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "N/A"
    return `${(value * 100).toFixed(2)}%`
  }

  const formatPercentDirect = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "N/A"
    return `${value.toFixed(2)}%`
  }

  const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
    if (value === null || value === undefined) return "N/A"
    return value.toFixed(decimals)
  }

  const formatVolume = (vol: number | null | undefined) => {
    if (!vol) return "N/A"
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2
    }).format(vol)
  }

  const formatLargeNumber = (num: number | null | undefined) => {
    if (!num) return "N/A"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2
    }).format(num)
  }

  const change = stock.price - stock.prev_close
  const changePercent = (change / stock.prev_close) * 100
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat"
  const colorClass = direction === "up" ? "text-emerald-500" : direction === "down" ? "text-red-500" : "text-muted-foreground"

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="text-foreground transition-colors duration-300 pb-8 min-h-screen bg-transparent">
        <Header
          theme={theme}
          soundEnabled={soundEnabled}
          onToggleTheme={toggleTheme}
          onToggleSound={toggleSound}
          marketStatus={marketStatus}
          marketType="nasdaq"
        />
        <main className="container mx-auto px-4 py-6">
          <Button
            variant="ghost"
            className="mb-6 pl-0 hover:bg-transparent hover:text-primary"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="mb-8">
            <div className="flex items-center gap-4 mb-2">
              {fmpMarket?.image && (
                <img
                  src={fmpMarket.image}
                  alt={`${symbol} logo`}
                  className="w-12 h-12 rounded-lg object-contain bg-white/10 p-1"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div className="flex items-baseline gap-4">
                <h1 className="text-4xl font-bold">{stock.symbol}</h1>
                <div className={cn("text-4xl font-bold tabular-nums", colorClass)}>
                  {formatPrice(stock.price)}
                </div>
                <div className={cn("text-xl font-medium tabular-nums", colorClass)}>
                  {changePercent > 0 ? "+" : ""}{changePercent.toFixed(2)}%
                </div>
              </div>
              {/* Alert Button */}
              {userId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-4 gap-2"
                  onClick={() => setIsAlertModalOpen(true)}
                >
                  <Bell className="h-4 w-4" />
                  Set Alert
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-lg">{profile?.name || "Stock Detail View"}</p>
          </div>

          {/* Alert Modal */}
          <CreateAlertModal
            isOpen={isAlertModalOpen}
            onClose={() => setIsAlertModalOpen(false)}
            userId={userId}
            symbol={symbol}
            currentPrice={stock.price}
            marketType="nasdaq"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Interactive Stock Chart */}
              {symbol && (
                <StockChart symbol={symbol} theme={theme} />
              )}

              {/* Valuation Comparison Chart */}
              {symbol && (
                <ValuationChart symbol={symbol} marketType="nasdaq" />
              )}

              {/* Financial Metrics Card */}
              {(financial || fmpFinancials) && (
                <Card className="relative overflow-hidden bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-500" />
                      <span className="text-white font-semibold tracking-tight">Financial Metrics</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {/* Valuation */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Valuation</h4>
                        <InfoRow label="P/E Ratio" value={formatNumber(financial?.trailingPE)} />
                        <InfoRow label="Forward P/E" value={formatNumber(financial?.forwardPE)} />
                        <InfoRow label="P/B Ratio" value={formatNumber(financial?.priceToBook)} />
                        <InfoRow label="P/S Ratio" value={formatNumber(financial?.priceToSalesTrailing12Months)} />
                        <InfoRow label="Beta" value={formatNumber(financial?.beta)} />
                        <InfoRow label="EPS" value={financial?.trailingEps ? formatPrice(financial.trailingEps) : "N/A"} />
                      </div>

                      {/* Price Statistics */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Price Statistics</h4>
                        <InfoRow label="52W High" value={financial?.fiftyTwoWeekHigh ? formatPrice(financial.fiftyTwoWeekHigh) : "N/A"} />
                        <InfoRow label="52W Low" value={financial?.fiftyTwoWeekLow ? formatPrice(financial.fiftyTwoWeekLow) : "N/A"} />
                        <InfoRow label="50D Avg" value={financial?.fiftyDayAverage ? formatPrice(financial.fiftyDayAverage) : "N/A"} />
                        <InfoRow label="200D Avg" value={financial?.twoHundredDayAverage ? formatPrice(financial.twoHundredDayAverage) : "N/A"} />
                        <InfoRow label="Market Cap" value={formatFinancialMarketCap(financial?.marketCap)} />
                      </div>

                      {/* Profitability */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Profitability</h4>
                        <InfoRow label="Revenue" value={formatLargeNumber(fmpFinancials?.revenue)} />
                        <InfoRow label="Net Income" value={formatLargeNumber(fmpFinancials?.netIncome)} />
                        <InfoRow label="EBITDA" value={formatLargeNumber(fmpFinancials?.ebitda)} />
                        <InfoRow label="Gross Margin" value={fmpFinancials?.grossMargin ? formatPercentDirect(fmpFinancials.grossMargin * 100) : formatPercent(financial?.profitMargins)} />
                        <InfoRow label="Op. Margin" value={formatPercent(financial?.operatingMargins)} />
                        <InfoRow label="ROE" value={formatPercent(financial?.returnOnEquity)} />
                      </div>

                      {/* Cash & Liquidity */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Cash & Liquidity</h4>
                        <InfoRow label="Cash & Equiv." value={formatLargeNumber(fmpFinancials?.cashAndCashEquivalents)} />
                        <InfoRow label="Op. Cash Flow" value={formatLargeNumber(fmpFinancials?.operatingCashFlow)} />
                        <InfoRow label="Free Cash Flow" value={formatLargeNumber(fmpFinancials?.freeCashFlow)} />
                        <InfoRow label="Current Ratio" value={formatNumber(financial?.currentRatio)} />
                        <InfoRow label="Debt/Equity" value={formatNumber(financial?.debtToEquity)} />
                      </div>
                    </div>

                    {/* Balance Sheet Row */}
                    {fmpFinancials && (
                      <>
                        <div className="h-px bg-border my-4" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          {/* Assets & Liabilities */}
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Balance Sheet</h4>
                            <InfoRow label="Total Assets" value={formatLargeNumber(fmpFinancials.totalAssets)} />
                            <InfoRow label="Total Liabilities" value={formatLargeNumber(fmpFinancials.totalLiabilities)} />
                            <InfoRow label="Total Equity" value={formatLargeNumber(fmpFinancials.totalEquity)} />
                          </div>

                          {/* Growth & Returns */}
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Growth & Returns</h4>
                            <InfoRow label="ROA" value={formatPercent(financial?.returnOnAssets)} />
                            <InfoRow label="Revenue Growth" value={formatPercent(financial?.revenueGrowth)} />
                            <InfoRow label="Earnings Growth" value={formatPercent(financial?.earningsGrowth)} />
                          </div>

                          {/* Dividend & Ownership */}
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Dividend & Ownership</h4>
                            <InfoRow label="Dividend Yield" value={formatPercent(financial?.dividendYield)} />
                            <InfoRow label="Annual Dividend" value={financial?.dividendRate ? formatPrice(financial.dividendRate) : "N/A"} />
                            <InfoRow label="Institutional %" value={formatPercent(financial?.heldPercentInstitutions)} />
                          </div>

                          {/* Placeholder for symmetry or additional info */}
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-muted-foreground border-b border-border/50 pb-1">Operating</h4>
                            <InfoRow label="Gross Profit" value={formatLargeNumber(fmpFinancials.grossProfit)} />
                            <InfoRow label="Op. Income" value={formatLargeNumber(fmpFinancials.operatingIncome)} />
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* MAG7 Revenue Segments (Product & Geographic) */}
              {symbol && <MAG7SegmentsPanel symbol={symbol} />}
            </div>

            <div className="lg:col-span-1 space-y-4">
              <Card className="relative overflow-hidden bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
                <CardHeader className="pb-2">
                  <span className="text-white font-semibold tracking-tight">Market Data</span>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <InfoRow label="Current Price" value={formatPrice(stock.price)} valueClassName={colorClass} />
                    <InfoRow label="Change %" value={`${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`} valueClassName={colorClass} />
                    <InfoRow label="Daily High" value={formatPrice(stock.high)} />
                    <InfoRow label="Daily Low" value={formatPrice(stock.low)} />
                    <InfoRow label="Open Price" value={formatPrice(stock.open)} />
                    <InfoRow label="Prev Close" value={formatPrice(stock.prev_close)} />
                    <InfoRow label="Volume" value={formatVolume(fmpMarket?.volume)} />

                    <InfoRow label="Last Updated" value={formatTime(stock.timestamp)} />
                  </div>

                  <div className="h-px bg-border my-4" />
                  <div className="space-y-2">
                    <InfoRow label="Name" value={fmpMarket?.companyName || profile?.name || "N/A"} />
                    <InfoRow label="CEO" value={fmpMarket?.ceo || "N/A"} />
                    <InfoRow label="Sector" value={fmpMarket?.sector || "N/A"} />
                    <InfoRow label="Industry" value={fmpMarket?.industry || "N/A"} />
                    <InfoRow label="Exchange" value={fmpMarket?.exchange || profile?.exchange || "N/A"} />
                    <InfoRow label="Beta" value={fmpMarket?.beta ? formatNumber(fmpMarket.beta) : "N/A"} />
                    <InfoRow label="Market Cap" value={formatLargeNumber(fmpMarket?.marketCap || (profile?.marketCapitalization ? profile.marketCapitalization * 1000000 : null))} />
                  </div>
                </CardContent>
              </Card>

              {/* Financial Health Radar Chart */}
              {symbol && <FinancialRadarChart symbol={symbol} />}

              {/* Similar Companies Section */}
              {peers.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-medium">Similar Companies</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {peers.slice(0, 4).map((peerSymbol) => {
                      const peerQuote = peerQuotes[peerSymbol]

                      let pChangePercent = 0
                      let pColorClass = "text-muted-foreground"

                      if (peerQuote) {
                        const pChange = peerQuote.price - peerQuote.prev_close
                        pChangePercent = (pChange / peerQuote.prev_close) * 100
                        const pDirection = pChange > 0 ? "up" : pChange < 0 ? "down" : "flat"
                        pColorClass = pDirection === "up" ? "text-emerald-500" : pDirection === "down" ? "text-red-500" : "text-muted-foreground"
                      }

                      const glowClass = pColorClass.includes("emerald")
                        ? "shadow-[0_0_10px_rgba(16,185,129,0.15)] border-emerald-500/20"
                        : pColorClass.includes("red")
                          ? "shadow-[0_0_10px_rgba(239,68,68,0.15)] border-red-500/20"
                          : "border-border/50";

                      return (
                        <Link to={`/${peerSymbol}`} key={peerSymbol}>
                          <Card className={cn("hover:bg-accent/50 transition-all h-full bg-card/60 backdrop-blur-md", glowClass)}>
                            <CardContent className="p-3 flex flex-col items-center justify-center text-center gap-1">
                              <span className="font-bold text-sm">{peerSymbol}</span>
                              {peerQuote ? (
                                <>
                                  <span className="font-mono text-xs">{formatPrice(peerQuote.price)}</span>
                                  <span className={cn("text-xs font-medium", pColorClass)}>
                                    {pChangePercent > 0 ? "+" : ""}{pChangePercent.toFixed(2)}%
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground animate-pulse">...</span>
                              )}
                            </CardContent>
                          </Card>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function InfoRow({ label, value, valueClassName }: { label: string, value: string | number, valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground font-light">{label}</span>
      <span className={cn("font-mono font-medium tabular-nums text-right", valueClassName)}>{value}</span>
    </div>
  )
}

