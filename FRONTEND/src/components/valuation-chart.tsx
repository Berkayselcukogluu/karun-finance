"use client"

import { useState, useEffect } from "react"
import { Info, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ValuationMetric {
  key: string
  label: string
  description: string
  company: number | null
  sector: number | null
  industry: number | null
}

interface ValuationData {
  symbol: string
  sector: string
  industry: string
  metrics: ValuationMetric[]
}

interface ValuationChartProps {
  symbol: string
  marketType?: "nasdaq"
}

const metricShortLabelsEn: Record<string, string> = {
  trailingPE: "P/E",
  priceToBook: "P/B",
  priceToSalesTrailing12Months: "EV/Sales",
  enterpriseToEbitda: "EV/EBITDA",
  pegRatio: "PEG",
  earningsPerShare: "EPS",
}

export function ValuationChart({ symbol }: ValuationChartProps) {
  const [data, setData] = useState<ValuationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [activeMetricKey, setActiveMetricKey] = useState<string>("trailingPE")

  const apiEndpoint = `/api/valuation/${symbol}`

  const labels = { 
    title: "Valuation Multiples", 
    sector: "Sector Average",
    industry: "Industry Average", 
    company: "Company Ratio Value",
    info: "Valuation multiples compare a company's stock price to fundamental financial metrics. Lower multiples may indicate undervaluation, while higher multiples may reflect growth expectations.",
    na: "N/A",
    historical: "Switch to Historical"
  }

  const shortLabels = metricShortLabelsEn

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await fetch(apiEndpoint)
        if (response.ok) {
          const result = await response.json()
          setData(result)
          if (result.metrics && result.metrics.length > 0) {
            setActiveMetricKey(result.metrics[0].key)
          }
        } else {
          setError("Data not available")
        }
      } catch {
        setError("Connection error")
      } finally {
        setLoading(false)
      }
    }

    if (symbol) {
      fetchData()
    }
  }, [symbol, apiEndpoint])

  // Loading State
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-5 w-48 bg-white/5 rounded animate-pulse" />
          </div>
          <div className="flex gap-4">
            <div className="w-32 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-white/[0.02] rounded animate-pulse" />
              ))}
            </div>
            <div className="flex-1 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-white/[0.02] rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error State
  if (error || !data) {
    return (
      <div className="relative overflow-hidden rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-white font-medium">{labels.title}</span>
          </div>
          <div className="h-[200px] flex items-center justify-center text-[#A0A0A0] text-sm">
            {error || "Data not found"}
          </div>
        </div>
      </div>
    )
  }

  // Filter out dividend yield, keep only main metrics
  const filteredMetrics = data.metrics.filter(m => m.key !== 'dividendYield')
  
  // Get active metric
  const activeMetric = filteredMetrics.find(m => m.key === activeMetricKey) || filteredMetrics[0]

  // Get max value for scaling bars (with some padding)
  const getMaxValue = () => {
    if (!activeMetric) return 100
    const values = [activeMetric.company, activeMetric.sector]
      .filter(v => v !== null && v !== undefined) as number[]
    if (values.length === 0) return 100
    return Math.max(...values) * 1.15 // 15% padding
  }

  const maxValue = getMaxValue()

  const formatValue = (value: number | null) => {
    if (value === null || value === undefined) return labels.na
    return value.toFixed(2).replace('.', ',')
  }

  const getBarWidth = (value: number | null) => {
    if (value === null || value === 0 || maxValue === 0) return 0
    return Math.min((value / maxValue) * 100, 100)
  }

  return (
    <div className="relative overflow-hidden rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-purple-500" />
            <h3 className="text-white font-semibold tracking-tight">{labels.title}</h3>
            <span className="text-[#606060] text-sm">{shortLabels[activeMetricKey] || activeMetric?.label}</span>
            <div 
              className="relative p-1 rounded-full hover:bg-white/[0.08] transition-colors cursor-help"
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
            >
              <Info className="h-3.5 w-3.5 text-[#606060]" />
              
              {/* Info Tooltip */}
              {showInfo && (
                <div className="absolute top-full left-0 mt-2 z-50 w-72 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4 shadow-2xl shadow-black/50">
                    <p className="text-xs text-[#A0A0A0] leading-relaxed font-normal">
                      {labels.info}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Historical Button */}
          <button className="px-4 py-2 text-xs font-medium text-[#A0A0A0] border border-white/[0.15] rounded-md hover:bg-white/[0.05] hover:text-white transition-all">
            {labels.historical}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex">
        {/* Sidebar Navigation - Metric Buttons */}
        <div className="w-36 border-r border-white/[0.06] py-4 px-2 space-y-1">
          {filteredMetrics.map((metric) => {
            const isActive = activeMetricKey === metric.key
            const shortLabel = shortLabels[metric.key] || metric.label
            
            return (
              <button
                key={metric.key}
                onClick={() => setActiveMetricKey(metric.key)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-md text-xs font-medium transition-all duration-200",
                  isActive 
                    ? "bg-[#1E3A5F] text-white border border-[#3B82F6]/30" 
                    : "text-[#606060] hover:text-[#909090] hover:bg-white/[0.04]"
                )}
              >
                {shortLabel}
              </button>
            )
          })}
        </div>

        {/* Chart Area */}
        <div className="flex-1 p-6">
          {activeMetric && (
            <div className="space-y-5">
              {/* Company Bar */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#A0A0A0] w-40 truncate">
                    {symbol} {labels.company}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-6 bg-white/[0.03] rounded overflow-hidden">
                    {activeMetric.company !== null && activeMetric.company !== 0 && (
                      <div
                        className={cn(
                          "h-full rounded transition-all duration-700 ease-out flex items-center justify-end pr-3",
                          activeMetric.company < 0 
                            ? "bg-gradient-to-r from-[#DC2626] to-[#EF4444]" 
                            : "bg-gradient-to-r from-[#27AE60] to-[#2ECC71]"
                        )}
                        style={{ width: `${getBarWidth(Math.abs(activeMetric.company))}%` }}
                      >
                        {getBarWidth(Math.abs(activeMetric.company)) > 15 && (
                          <span className="text-xs font-mono text-white font-medium">
                            {formatValue(activeMetric.company)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {(activeMetric.company === null || activeMetric.company === 0 || getBarWidth(Math.abs(activeMetric.company)) <= 15) && (
                    <span className={cn(
                      "text-xs font-mono w-16 text-right",
                      activeMetric.company !== null && activeMetric.company < 0 ? "text-red-500" : "text-white/70"
                    )}>
                      {formatValue(activeMetric.company)}
                    </span>
                  )}
                </div>
              </div>

              {/* Sector Bar */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#A0A0A0] w-40 truncate">
                    {labels.sector}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-6 bg-white/[0.03] rounded overflow-hidden">
                    {activeMetric.sector !== null && activeMetric.sector !== 0 && (
                      <div
                        className={cn(
                          "h-full rounded transition-all duration-700 ease-out flex items-center justify-end pr-3",
                          activeMetric.sector < 0 
                            ? "bg-gradient-to-r from-[#DC2626] to-[#EF4444]" 
                            : "bg-gradient-to-r from-[#2980B9] to-[#3498DB]"
                        )}
                        style={{ width: `${getBarWidth(Math.abs(activeMetric.sector))}%` }}
                      >
                        {getBarWidth(Math.abs(activeMetric.sector)) > 15 && (
                          <span className="text-xs font-mono text-white font-medium">
                            {formatValue(activeMetric.sector)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {(activeMetric.sector === null || activeMetric.sector === 0 || getBarWidth(Math.abs(activeMetric.sector)) <= 15) && (
                    <span className={cn(
                      "text-xs font-mono w-16 text-right",
                      activeMetric.sector !== null && activeMetric.sector < 0 ? "text-red-500" : "text-white/70"
                    )}>
                      {formatValue(activeMetric.sector)}
                    </span>
                  )}
                </div>
              </div>

              {/* X-Axis Scale */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[10px] text-[#505050] font-mono">
                <span>0</span>
                <span>{(maxValue * 0.25).toFixed(0)}</span>
                <span>{(maxValue * 0.5).toFixed(0)}</span>
                <span>{(maxValue * 0.75).toFixed(0)}</span>
                <span>{maxValue.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
