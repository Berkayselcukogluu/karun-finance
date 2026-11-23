"use client"

import { useState, useEffect } from "react"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { Activity, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface FinancialHealthData {
  symbol: string
  efficiency: { raw: number | null; score: number }
  liquidity: { raw: number | null; score: number }
  leverage: { raw: number | null; score: number }
  profitability: { raw: number | null; score: number }
  growth: { raw: number | null; score: number }
}

interface RadarDataPoint {
  metric: string
  score: number
  raw: number | null
  fullMark: number
  description: string
}

interface FinancialRadarChartProps {
  symbol: string
}

// Custom tooltip component
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: RadarDataPoint }[] }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-3 shadow-2xl shadow-black/50">
        <p className="text-white font-semibold text-sm mb-1">{data.metric}</p>
        <p className="text-[#A0A0A0] text-xs mb-1">{data.description}</p>
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/10">
          <span className="text-xs text-[#606060]">Score:</span>
          <span className="text-sm font-mono text-emerald-400">{data.score.toFixed(1)}/5</span>
        </div>
        {data.raw !== null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[#606060]">Raw:</span>
            <span className="text-sm font-mono text-white">
              {data.metric === 'Profitability' || data.metric === 'Growth' 
                ? `${data.raw.toFixed(1)}%`
                : data.raw.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    )
  }
  return null
}

export function FinancialRadarChart({ symbol }: FinancialRadarChartProps) {
  const [data, setData] = useState<FinancialHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/financial-health/${symbol}`)
        if (response.ok) {
          const result = await response.json()
          setData(result)
        } else {
          setError("Data not available")
        }
      } catch (err) {
        setError("Connection error")
      } finally {
        setLoading(false)
      }
    }

    if (symbol) {
      fetchData()
    }
  }, [symbol])

  // Loading State
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-5 w-32 bg-white/5 rounded animate-pulse" />
          </div>
          <div className="h-[280px] flex items-center justify-center">
            <div className="w-48 h-48 rounded-full bg-white/[0.02] animate-pulse" />
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
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-emerald-500" />
            <span className="text-white font-semibold tracking-tight">Financial Health</span>
          </div>
          <div className="h-[200px] flex items-center justify-center text-[#A0A0A0] text-sm">
            {error || "Data not found"}
          </div>
        </div>
      </div>
    )
  }

  // Check for missing data - all raw values must exist
  const hasAllData = 
    data.efficiency.raw !== null &&
    data.liquidity.raw !== null &&
    data.leverage.raw !== null &&
    data.profitability.raw !== null &&
    data.growth.raw !== null

  // Missing Data State - show which metrics are missing
  if (!hasAllData) {
    const missingMetrics: string[] = []
    if (data.efficiency.raw === null) missingMetrics.push("Efficiency (Asset Turnover)")
    if (data.liquidity.raw === null) missingMetrics.push("Liquidity (Current Ratio)")
    if (data.leverage.raw === null) missingMetrics.push("Leverage (Debt/Equity)")
    if (data.profitability.raw === null) missingMetrics.push("Profitability (Net Margin)")
    if (data.growth.raw === null) missingMetrics.push("Growth (Revenue Growth)")

    return (
      <div className="relative overflow-hidden rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-amber-500" />
            <span className="text-white font-semibold tracking-tight">Financial Health</span>
          </div>
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="text-amber-500/80 text-sm font-medium">
              Insufficient Data for Radar Chart
            </div>
            <div className="text-[#606060] text-xs text-center max-w-[280px]">
              The following metrics are unavailable:
            </div>
            <ul className="text-[#808080] text-xs space-y-1">
              {missingMetrics.map((metric, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-amber-500/50" />
                  {metric}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // Transform data for Recharts
  const radarData: RadarDataPoint[] = [
    {
      metric: "Efficiency",
      score: data.efficiency.score,
      raw: data.efficiency.raw,
      fullMark: 5,
      description: "Asset Turnover - How well assets generate revenue"
    },
    {
      metric: "Liquidity",
      score: data.liquidity.score,
      raw: data.liquidity.raw,
      fullMark: 5,
      description: "Current Ratio - Ability to pay short-term obligations"
    },
    {
      metric: "Leverage",
      score: data.leverage.score,
      raw: data.leverage.raw,
      fullMark: 5,
      description: "Debt/Equity - Financial leverage (lower is better)"
    },
    {
      metric: "Profitability",
      score: data.profitability.score,
      raw: data.profitability.raw,
      fullMark: 5,
      description: "Net Profit Margin - Bottom line efficiency"
    },
    {
      metric: "Growth",
      score: data.growth.score,
      raw: data.growth.raw,
      fullMark: 5,
      description: "Revenue Growth - Year over year expansion"
    },
  ]

  // Calculate average score
  const avgScore = radarData.reduce((sum, d) => sum + d.score, 0) / radarData.length

  // Score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 4) return "text-emerald-400"
    if (score >= 3) return "text-yellow-400"
    if (score >= 2) return "text-orange-400"
    return "text-red-400"
  }

  return (
    <div className="relative overflow-hidden rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08]">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-emerald-500" />
            <h3 className="text-white font-semibold tracking-tight">Financial Health</h3>
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
                      Financial health radar shows 5 key metrics normalized to a 0-5 scale. 
                      Higher scores indicate better financial condition. Data sourced from FMP ratios.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Average Score Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#606060]">Avg Score:</span>
            <span className={cn("text-lg font-bold font-mono", getScoreColor(avgScore))}>
              {avgScore.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
            {/* Grid */}
            <PolarGrid 
              stroke="#ffffff" 
              strokeOpacity={0.1}
              strokeDasharray="3 3"
            />
            
            {/* Angle Axis (Labels) */}
            <PolarAngleAxis 
              dataKey="metric" 
              tick={{ 
                fill: '#ffffff', 
                fontSize: 11,
                fontWeight: 500
              }}
              tickLine={false}
            />
            
            {/* Radius Axis (Scale) */}
            <PolarRadiusAxis 
              angle={90} 
              domain={[0, 5]} 
              tick={{ 
                fill: '#505050', 
                fontSize: 9 
              }}
              tickCount={6}
              axisLine={false}
            />
            
            {/* Data Area */}
            <Radar
              name="Score"
              dataKey="score"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#radarGradient)"
              fillOpacity={0.5}
              dot={{
                r: 4,
                fill: '#ffffff',
                stroke: '#10B981',
                strokeWidth: 2
              }}
              activeDot={{
                r: 6,
                fill: '#10B981',
                stroke: '#ffffff',
                strokeWidth: 2
              }}
            />
            
            {/* Gradient Definition */}
            <defs>
              <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            
            {/* Tooltip */}
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Score Legend */}
      <div className="px-6 pb-5 pt-2 border-t border-white/[0.06]">
        <div className="grid grid-cols-5 gap-2">
          {radarData.map((item) => (
            <div key={item.metric} className="text-center">
              <div className={cn("text-sm font-mono font-bold", getScoreColor(item.score))}>
                {item.score.toFixed(1)}
              </div>
              <div className="text-[10px] text-[#606060] truncate">
                {item.metric}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
