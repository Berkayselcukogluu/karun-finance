"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  X,
  Bell,
  TrendingUp,
  TrendingDown,
  Volume2,
  Percent,
  AlertCircle,
  Check,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type AlertType = "price_above" | "price_below" | "volume_spike" | "percent_up" | "percent_down"
type AlertPriority = "low" | "medium" | "high" | "critical"

interface CreateAlertModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string | null
  symbol?: string
  currentPrice?: number
  marketType?: "nasdaq"
}

const ALERT_TYPES = [
  {
    type: "price_above" as AlertType,
    label: "Price Above",
    description: "Triggers when price rises above target value",
    icon: <TrendingUp className="h-4 w-4" />,
    color: "text-emerald-500"
  },
  {
    type: "price_below" as AlertType,
    label: "Price Below",
    description: "Triggers when price drops below target value",
    icon: <TrendingDown className="h-4 w-4" />,
    color: "text-red-500"
  },
  {
    type: "volume_spike" as AlertType,
    label: "Volume Spike",
    description: "Triggers when volume increases by target percentage",
    icon: <Volume2 className="h-4 w-4" />,
    color: "text-blue-500"
  },
  {
    type: "percent_up" as AlertType,
    label: "Percent Gain",
    description: "Triggers when price gains target percentage",
    icon: <Percent className="h-4 w-4" />,
    color: "text-emerald-500"
  },
  {
    type: "percent_down" as AlertType,
    label: "Percent Drop",
    description: "Triggers when price drops by target percentage",
    icon: <Percent className="h-4 w-4" />,
    color: "text-red-500"
  }
]

const PRIORITIES = [
  { value: "low" as AlertPriority, label: "Low", color: "bg-blue-500", description: "Informational" },
  { value: "medium" as AlertPriority, label: "Medium", color: "bg-yellow-500", description: "Standard priority" },
  { value: "high" as AlertPriority, label: "High", color: "bg-orange-500", description: "Important alert" },
  { value: "critical" as AlertPriority, label: "Critical", color: "bg-red-500", description: "Requires immediate attention" }
]

export function CreateAlertModal({
  isOpen,
  onClose,
  userId,
  symbol: initialSymbol = "",
  currentPrice,
  marketType = "nasdaq"
}: CreateAlertModalProps) {
  const [symbol, setSymbol] = useState(initialSymbol)
  const [alertType, setAlertType] = useState<AlertType>("price_above")
  const [targetValue, setTargetValue] = useState("")
  const [priority, setPriority] = useState<AlertPriority>("medium")
  const [note, setNote] = useState("")
  const [isRecurring, setIsRecurring] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen && initialSymbol) {
      setSymbol(initialSymbol)
    }
  }, [isOpen, initialSymbol])

  useEffect(() => {
    if (currentPrice && (alertType === "price_above" || alertType === "price_below")) {
      const suggestedValue = alertType === "price_above"
        ? (currentPrice * 1.05).toFixed(2)
        : (currentPrice * 0.95).toFixed(2)
      setTargetValue(suggestedValue)
    } else if (alertType === "volume_spike") {
      setTargetValue("50")
    } else if (alertType === "percent_up" || alertType === "percent_down") {
      setTargetValue("5")
    }
  }, [alertType, currentPrice])

  const handleSubmit = async () => {
    if (!userId || !symbol || !targetValue) {
      setError("Please fill in all required fields")
      return
    }

    setLoading(true)
    setError("")

    try {
      const response = await fetch(`/api/alerts/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          alert_type: alertType,
          target_value: parseFloat(targetValue),
          priority,
          market_type: marketType,
          note: note || null,
          is_recurring: isRecurring,
          current_value: currentPrice ?? null
        })
      })

      if (response.ok) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
          setSymbol(initialSymbol)
          setAlertType("price_above")
          setTargetValue("")
          setPriority("medium")
          setNote("")
          setIsRecurring(false)
          setSuccess(false)
        }, 1500)
      } else {
        const data = await response.json()
        setError(data.detail || "Failed to create alert")
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const getInputPlaceholder = () => {
    switch (alertType) {
      case "price_above":
      case "price_below":
        return currentPrice ? `Current: $${currentPrice.toFixed(2)}` : "Target price"
      case "volume_spike":
        return "Volume spike % (e.g., 50)"
      case "percent_up":
      case "percent_down":
        return "Change % (e.g., 5)"
      default:
        return "Target value"
    }
  }

  const getInputPrefix = () => {
    switch (alertType) {
      case "price_above":
      case "price_below":
        return "$"
      case "volume_spike":
      case "percent_up":
      case "percent_down":
        return "%"
      default:
        return ""
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Create New Alert</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {success ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center py-8"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-emerald-500" />
                </div>
                <p className="text-lg font-medium">Alert Created!</p>
                <p className="text-sm text-muted-foreground">
                  Alert active for {symbol.toUpperCase()}
                </p>
              </motion.div>
            ) : (
              <>
                {/* Symbol Input */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Symbol</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="AAPL, NVDA, MSFT..."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    disabled={!!initialSymbol}
                  />
                </div>

                {/* Alert Type Selection */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Alert Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALERT_TYPES.map((type) => (
                      <button
                        key={type.type}
                        onClick={() => setAlertType(type.type)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-all ${
                          alertType === type.type
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <span className={type.color}>{type.icon}</span>
                        <span className="font-medium">{type.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {ALERT_TYPES.find(t => t.type === alertType)?.description}
                  </p>
                </div>

                {/* Target Value Input */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Target Value</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      {getInputPrefix()}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder={getInputPlaceholder()}
                      className="w-full pl-7 pr-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  {currentPrice && (alertType === "price_above" || alertType === "price_below") && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Current price: ${currentPrice.toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Priority Selection */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Priority</label>
                  <div className="flex gap-2">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setPriority(p.value)}
                        className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all ${
                          priority === p.value
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                        title={p.description}
                      >
                        <span className={`w-3 h-3 rounded-full ${p.color}`} />
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note Input */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Note (Optional)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note for this alert..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {/* Recurring Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">Recurring Alert</p>
                    <p className="text-xs text-muted-foreground">Automatically re-arms after triggering</p>
                  </div>
                  <button
                    onClick={() => setIsRecurring(!isRecurring)}
                    aria-label="Toggle recurring alert"
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      isRecurring ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        isRecurring ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {!success && (
            <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading || !symbol || !targetValue}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Create Alert
                  </span>
                )}
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
