"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createChart, IChartApi, Time, CandlestickSeries, AreaSeries, HistogramSeries } from "lightweight-charts"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, BarChart2, LineChart, CandlestickChart } from "lucide-react"

interface ChartDataPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface StockChartProps {
  symbol: string
  theme?: "dark" | "light"
}

type ChartType = "candlestick" | "line" | "area"
type PeriodType = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "max"

const PERIODS: { value: PeriodType; label: string }[] = [
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "2y", label: "2Y" },
  { value: "max", label: "All" },
]

export function StockChart({ symbol, theme = "dark" }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const isChartMounted = useRef<boolean>(false)
  const [period, setPeriod] = useState<PeriodType>("6mo")
  const [chartType, setChartType] = useState<ChartType>("candlestick")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [tooltipData, setTooltipData] = useState<{
    open: number
    high: number
    low: number
    close: number
    volume: number
    date: string
    change: number
    changePercent: number
  } | null>(null)

  // Heikin-Ashi transformation
  const convertToHeikinAshi = useCallback((data: ChartDataPoint[]): ChartDataPoint[] => {
    if (data.length === 0) return []

    const haData: ChartDataPoint[] = []
    let prevHA = { open: data[0].open, close: data[0].close }

    for (let i = 0; i < data.length; i++) {
      const curr = data[i]

      const haClose = (curr.open + curr.high + curr.low + curr.close) / 4
      const haOpen = i === 0 ? curr.open : (prevHA.open + prevHA.close) / 2
      const haHigh = Math.max(curr.high, haOpen, haClose)
      const haLow = Math.min(curr.low, haOpen, haClose)

      haData.push({
        date: curr.date,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        volume: curr.volume
      })

      prevHA = { open: haOpen, close: haClose }
    }

    return haData
  }, [])

  const fetchChartData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/history/${symbol}?period=${period}`)
      if (!response.ok) {
        throw new Error("Data not available")
      }
      const data: ChartDataPoint[] = await response.json()
      setChartData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [symbol, period])

  useEffect(() => {
    fetchChartData()
  }, [fetchChartData])

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0 || loading) return

    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (e) {
        console.warn("Chart cleanup warning:", e)
      }
      chartRef.current = null
    }

    isChartMounted.current = true

    const isDark = theme === "dark"
    const backgroundColor = "transparent"
    const textColor = isDark ? "#94a3b8" : "#64748b"
    const borderColor = isDark ? "#334155" : "#cbd5e1"

    let chart: IChartApi | null = null

    chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: backgroundColor },
        textColor: textColor,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: borderColor,
          style: 3,
        },
        horzLine: {
          width: 1,
          color: borderColor,
          style: 3,
        },
      },
      rightPriceScale: {
        borderColor: borderColor,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
    })

    if (!isChartMounted.current) {
      chart.remove()
      return
    }

    chartRef.current = chart

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mainSeries: any

    if (chartType === "candlestick") {
      const haData = convertToHeikinAshi(chartData)

      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#00ff88",
        downColor: "#ff0033",
        borderVisible: true,
        borderUpColor: "#00ff88",
        borderDownColor: "#ff0033",
        wickUpColor: "#00ff88",
        wickDownColor: "#ff0033",
      })

      const candleData = haData.map((d) => ({
        time: d.date as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))

      mainSeries.setData(candleData)
    } else {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: "#a855f7",
        topColor: chartType === "area" ? "rgba(168, 85, 247, 0.4)" : "transparent",
        bottomColor: chartType === "area" ? "rgba(168, 85, 247, 0.0)" : "transparent",
        lineWidth: 2,
      })

      const lineData = chartData.map((d) => ({
        time: d.date as Time,
        value: d.close,
      }))

      mainSeries.setData(lineData)
    }

    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData.size > 0) {
        const data = param.seriesData.get(mainSeries)
        if (data) {
          const idx = chartData.findIndex((d) => d.date === param.time)
          const currentData = chartData[idx]
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const closeValue = (data as any).close ?? (data as any).value ?? 0
          const prevClose = idx > 0 ? chartData[idx - 1].close : currentData?.open || closeValue
          const change = closeValue - prevClose
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

          setTooltipData({
            open: currentData?.open || closeValue,
            high: currentData?.high || closeValue,
            low: currentData?.low || closeValue,
            close: closeValue,
            volume: currentData?.volume || 0,
            date: param.time as string,
            change,
            changePercent,
          })
        }
      } else {
        setTooltipData(null)
      }
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#3b82f6",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "volume",
    })

    chart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    })

    const volumeData = chartData.map((d, idx) => {
      const prevClose = idx > 0 ? chartData[idx - 1].close : d.open
      const isUp = d.close >= prevClose
      return {
        time: d.date as Time,
        value: d.volume,
        color: isUp ? "rgba(135, 255, 132, 0.5)" : "rgba(239, 68, 68, 0.5)",
      }
    })

    volumeSeries.setData(volumeData)

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        try {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth })
        } catch {
          // Chart may have been disposed
        }
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      isChartMounted.current = false
      window.removeEventListener("resize", handleResize)
      if (chart) {
        try {
          chart.remove()
        } catch {
          // Chart may already be removed
        }
      }
      chartRef.current = null
    }
  }, [chartData, chartType, theme, loading])

  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null
  const firstData = chartData.length > 0 ? chartData[0] : null
  const periodChange = latestData && firstData ? latestData.close - firstData.close : 0
  const periodChangePercent = firstData && firstData.close > 0 ? (periodChange / firstData.close) * 100 : 0

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(price)
  }

  const formatVolume = (vol: number) => {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(vol)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  if (error) {
    return (
      <div className="w-full h-[500px] rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-red-500/20 flex flex-col items-center justify-center text-red-500 gap-4">
        <p>Chart unavailable: {error}</p>
        <Button variant="outline" onClick={fetchChartData}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b border-border/50 gap-4">
        {/* Period info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {periodChange >= 0 ? (
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            <span
              className={cn(
                "text-lg font-semibold",
                periodChange >= 0 ? "text-emerald-500" : "text-red-500"
              )}
            >
              {periodChange >= 0 ? "+" : ""}
              {periodChangePercent.toFixed(2)}%
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {PERIODS.find((p) => p.value === period)?.label} change
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Chart type buttons */}
          <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-none h-8 px-3",
                chartType === "candlestick" && "bg-primary/10 text-primary"
              )}
              onClick={() => setChartType("candlestick")}
              title="Candlestick"
            >
              <CandlestickChart className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-none h-8 px-3",
                chartType === "line" && "bg-primary/10 text-primary"
              )}
              onClick={() => setChartType("line")}
              title="Line Chart"
            >
              <LineChart className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-none h-8 px-3",
                chartType === "area" && "bg-primary/10 text-primary"
              )}
              onClick={() => setChartType("area")}
              title="Area Chart"
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Period buttons */}
          <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-none h-8 px-3 text-xs",
                  period === p.value && "bg-primary/10 text-primary font-semibold"
                )}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart container */}
      <div className="relative">
        {/* Tooltip overlay */}
        {tooltipData && (
          <div className="absolute top-4 left-4 z-10 bg-card/95 backdrop-blur border border-border/50 rounded-lg p-3 shadow-lg">
            <div className="text-xs text-muted-foreground mb-1">{formatDate(tooltipData.date)}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">O: </span>
                <span className="font-mono">{formatPrice(tooltipData.open)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">H: </span>
                <span className="font-mono text-emerald-500">{formatPrice(tooltipData.high)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">L: </span>
                <span className="font-mono text-red-500">{formatPrice(tooltipData.low)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">C: </span>
                <span className="font-mono">{formatPrice(tooltipData.close)}</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-xs">
              <span className="text-muted-foreground">Vol: {formatVolume(tooltipData.volume)}</span>
              <span
                className={cn(
                  "font-semibold",
                  tooltipData.change >= 0 ? "text-emerald-500" : "text-red-500"
                )}
              >
                {tooltipData.change >= 0 ? "+" : ""}
                {tooltipData.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-[400px]" />
      </div>

      {/* Footer stats */}
      {latestData && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 text-xs text-muted-foreground">
          <span>
            Period: {firstData && formatDate(firstData.date)} - {formatDate(latestData.date)}
          </span>
          <span>{chartData.length} trading days</span>
        </div>
      )}
    </div>
  )
}
