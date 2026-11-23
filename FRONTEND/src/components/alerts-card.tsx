"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Bell,
  BellRing,
  CheckCheck,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Percent,
  AlertTriangle,
  ChevronRight,
  Plus,
  Trash2,
  RefreshCw,
  BellOff,
} from "lucide-react"
import { motion } from "framer-motion"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Alert Types
type AlertType = "price_above" | "price_below" | "volume_spike" | "percent_up" | "percent_down"
type AlertPriority = "low" | "medium" | "high" | "critical"
type AlertStatus = "active" | "triggered" | "snoozed" | "expired" | "cancelled"

interface Alert {
  id: number
  user_id: string
  symbol: string
  market_type: string
  alert_type: AlertType
  target_value: number
  current_value_at_creation?: number
  priority: AlertPriority
  status: AlertStatus
  note?: string
  created_at: string
  triggered_at?: string
  triggered_value?: number
  is_recurring: boolean
  trigger_count: number
}

interface Notification {
  id: number
  alert_id: number
  user_id: string
  symbol: string
  alert_type: AlertType
  target_value: number
  triggered_value: number
  triggered_at: string
  is_read: boolean
  priority: AlertPriority
  message: string
  price_data_snapshot?: {
    price: number
    volume?: number
    timestamp: string
  }
}

interface AlertsCardProps {
  userId: string | null
  onCreateAlert?: () => void
}

// Priority styles
const PRIORITY_STYLES: Record<AlertPriority, { bg: string; text: string; border: string; badgeBg: string }> = {
  low: {
    bg: "bg-blue-500/10",
    text: "text-blue-500",
    border: "border-blue-500/30",
    badgeBg: "bg-blue-500"
  },
  medium: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-500",
    border: "border-yellow-500/30",
    badgeBg: "bg-yellow-500"
  },
  high: {
    bg: "bg-orange-500/10",
    text: "text-orange-500",
    border: "border-orange-500/30",
    badgeBg: "bg-orange-500"
  },
  critical: {
    bg: "bg-red-500/10",
    text: "text-red-500",
    border: "border-red-500/30",
    badgeBg: "bg-red-500"
  }
}

// Alert type icons
const ALERT_TYPE_ICONS: Record<AlertType, React.ReactNode> = {
  price_above: <TrendingUp className="h-3.5 w-3.5" />,
  price_below: <TrendingDown className="h-3.5 w-3.5" />,
  volume_spike: <BarChart3 className="h-3.5 w-3.5" />,
  percent_up: <Percent className="h-3.5 w-3.5" />,
  percent_down: <Percent className="h-3.5 w-3.5" />
}

// Alert type labels
const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  price_above: "Price Above",
  price_below: "Price Below",
  volume_spike: "Volume Spike",
  percent_up: "% Gain",
  percent_down: "% Drop"
}

export function AlertsCard({ userId, onCreateAlert }: AlertsCardProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeTab, setActiveTab] = useState<"notifications" | "alerts">("notifications")
  const [loading, setLoading] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!userId) return

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${protocol}//${window.location.host}/ws/alerts/${userId}`

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log("[WS] Alert WebSocket connected")
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === "connected") {
            setUnreadCount(data.data.unread_count)
          }
          else if (data.type === "notification") {
            setNotifications(prev => [data.data, ...prev])
            setUnreadCount(prev => prev + 1)
            setIsAnimating(true)
            setTimeout(() => setIsAnimating(false), 1000)

            if (Notification.permission === "granted") {
              new Notification("🔔 Alert Triggered!", {
                body: data.data.message,
                icon: "/favicon.ico"
              })
            }
          }
          else if (data.type === "unread_count") {
            setUnreadCount(data.data.count)
          }
          else if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }))
          }
        } catch (e) {
          console.error("[WS] Parse error:", e)
        }
      }

      ws.onclose = () => {
        console.log("[WS] Disconnected, reconnecting in 5s...")
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000)
      }

      ws.onerror = (error) => {
        console.error("[WS] Error:", error)
      }

      wsRef.current = ws
    } catch (e) {
      console.error("[WS] Connection error:", e)
    }
  }, [userId])

  // WebSocket cleanup
  useEffect(() => {
    if (userId) {
      connectWebSocket()

      if (Notification.permission === "default") {
        Notification.requestPermission()
      }
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [userId, connectWebSocket])

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/notifications/${userId}?limit=50`)
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unread_count)
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch alerts
  const fetchAlerts = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/alerts/${userId}`)
      if (response.ok) {
        const data = await response.json()
        setAlerts(data.alerts)
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error)
    } finally {
      setLoading(false)
    }
  }

  // Load data when popover opens
  useEffect(() => {
    if (open && userId) {
      fetchNotifications()
      fetchAlerts()
    }
  }, [open, userId])

  // Mark notification as read
  const markAsRead = async (notificationId: number) => {
    if (!userId) return
    try {
      await fetch(`/api/notifications/${userId}/${notificationId}/read`, { method: "POST" })
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Failed to mark as read:", error)
    }
  }

  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (!userId) return
    try {
      await fetch(`/api/notifications/${userId}/read-all`, { method: "POST" })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error("Failed to mark all as read:", error)
    }
  }

  // Cancel alert
  const cancelAlert = async (alertId: number) => {
    if (!userId) return
    try {
      const response = await fetch(`/api/alerts/${userId}/${alertId}`, { method: "DELETE" })
      if (response.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId))
      }
    } catch (error) {
      console.error("Failed to cancel alert:", error)
    }
  }

  // Snooze alert
  const snoozeAlert = async (alertId: number, minutes: number = 30) => {
    if (!userId) return
    try {
      await fetch(`/api/alerts/${userId}/${alertId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes })
      })
      fetchAlerts()
    } catch (error) {
      console.error("Failed to snooze alert:", error)
    }
  }

  // Reactivate alert
  const reactivateAlert = async (alertId: number) => {
    if (!userId) return
    try {
      await fetch(`/api/alerts/${userId}/${alertId}/reactivate`, { method: "POST" })
      fetchAlerts()
    } catch (error) {
      console.error("Failed to reactivate alert:", error)
    }
  }

  // Format relative timestamp
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  // Get badge style for highest unread priority
  const getHighestPriorityStyle = () => {
    if (unreadCount === 0) return PRIORITY_STYLES.medium

    const unreadNotifs = notifications.filter(n => !n.is_read)
    if (unreadNotifs.length === 0) return PRIORITY_STYLES.medium

    const priorities: AlertPriority[] = ["critical", "high", "medium", "low"]
    for (const priority of priorities) {
      if (unreadNotifs.some(n => n.priority === priority)) {
        return PRIORITY_STYLES[priority]
      }
    }
    return PRIORITY_STYLES.medium
  }

  const priorityStyle = getHighestPriorityStyle()

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="flex w-fit p-[3px] rounded-2xl cursor-pointer transition-colors hover:bg-black/20 dark:hover:bg-white/20">
            <div className="rounded-2xl w-full p-1 md:p-1.5">
              <motion.a
                title="Alerts"
                className="text-light-blue-light hover:text-black dark:text-gray-400 inline-flex items-center p-1.5 font-medium rounded-full text-sm text-center relative"
                animate={isAnimating ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {unreadCount > 0 ? (
                  <BellRing className={`w-4 h-4 ${priorityStyle.text}`} />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`absolute -top-1 -right-1 ${priorityStyle.badgeBg} text-white text-[10px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center font-medium`}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </motion.span>
                )}
              </motion.a>
            </div>
          </div>
        </PopoverTrigger>

        <PopoverContent
          className="w-96 mb-2 mr-2 p-0 bg-background/95 backdrop-blur-sm border-border/50 overflow-hidden"
          side="left"
          align="end"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Alerts</span>
              {unreadCount > 0 && (
                <span className={`text-xs ${priorityStyle.bg} ${priorityStyle.text} px-1.5 py-0.5 rounded-full`}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={markAllAsRead}
                  title="Mark all as read"
                >
                  <CheckCheck className="h-4 w-4" />
                </Button>
              )}
              {onCreateAlert && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setOpen(false)
                    onCreateAlert()
                  }}
                  title="New alert"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border/30">
            <button
              onClick={() => setActiveTab("notifications")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === "notifications"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Notifications
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === "alerts"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Active Alerts ({alerts.filter(a => a.status === "active").length})
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[350px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activeTab === "notifications" ? (
              /* Notifications Tab */
              notifications.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {notifications.map((notif, index) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`p-3 hover:bg-muted/20 transition-colors cursor-pointer ${
                        !notif.is_read ? "bg-muted/10" : ""
                      }`}
                      onClick={() => !notif.is_read && markAsRead(notif.id)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`mt-0.5 p-1.5 rounded-full ${PRIORITY_STYLES[notif.priority].bg}`}>
                          {ALERT_TYPE_ICONS[notif.alert_type]}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono font-semibold text-sm">
                              {notif.symbol}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_STYLES[notif.priority].bg} ${PRIORITY_STYLES[notif.priority].text}`}>
                              {ALERT_TYPE_LABELS[notif.alert_type]}
                            </span>
                            {!notif.is_read && (
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {notif.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(notif.triggered_at)}
                            </span>
                            {notif.price_data_snapshot && (
                              <span className="text-[10px] text-emerald-500 font-mono">
                                ${notif.price_data_snapshot.price?.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Triggered alerts will appear here
                  </p>
                </div>
              )
            ) : (
              /* Alerts Tab */
              alerts.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {alerts.map((alert, index) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`p-3 hover:bg-muted/20 transition-colors group relative overflow-hidden ${
                        alert.alert_type === "price_above" || alert.alert_type === "percent_up"
                          ? "border-r-2 border-r-emerald-500/50"
                          : alert.alert_type === "price_below" || alert.alert_type === "percent_down"
                          ? "border-r-2 border-r-red-500/50"
                          : ""
                      }`}
                      style={{
                        background: alert.alert_type === "price_above" || alert.alert_type === "percent_up"
                          ? "linear-gradient(to right, transparent 70%, rgba(16, 185, 129, 0.08) 100%)"
                          : alert.alert_type === "price_below" || alert.alert_type === "percent_down"
                          ? "linear-gradient(to right, transparent 70%, rgba(239, 68, 68, 0.08) 100%)"
                          : undefined
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className={`mt-0.5 p-1.5 rounded-full ${PRIORITY_STYLES[alert.priority].bg}`}>
                            {ALERT_TYPE_ICONS[alert.alert_type]}
                          </div>

                          {/* Content */}
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono font-semibold text-sm">
                                {alert.symbol}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                alert.status === "active"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : alert.status === "snoozed"
                                  ? "bg-yellow-500/10 text-yellow-500"
                                  : alert.status === "triggered"
                                  ? "bg-blue-500/10 text-blue-500"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {alert.status === "active" ? "Active" :
                                 alert.status === "snoozed" ? "Snoozed" :
                                 alert.status === "triggered" ? "Triggered" : alert.status}
                              </span>
                            </div>

                            <p className="text-xs text-muted-foreground">
                              {ALERT_TYPE_LABELS[alert.alert_type]}:
                              <span className="font-mono ml-1 text-foreground">
                                {alert.alert_type.includes("percent") || alert.alert_type === "volume_spike"
                                  ? `${alert.target_value}%`
                                  : `$${alert.target_value.toFixed(2)}`}
                              </span>
                            </p>

                            {alert.note && (
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">
                                {alert.note}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(alert.created_at)}
                              </span>
                              {alert.is_recurring && (
                                <span className="text-[10px] text-purple-500">
                                  🔄 Recurring
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {alert.status === "active" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-yellow-500"
                              onClick={() => snoozeAlert(alert.id)}
                              title="Snooze 30m"
                            >
                              <BellOff className="h-3 w-3" />
                            </Button>
                          )}
                          {(alert.status === "snoozed" || alert.status === "triggered") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-emerald-500"
                              onClick={() => reactivateAlert(alert.id)}
                              title="Reactivate"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-red-500"
                            onClick={() => cancelAlert(alert.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No alerts yet</p>
                  {onCreateAlert && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setOpen(false)
                        onCreateAlert()
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Create Alert
                    </Button>
                  )}
                </div>
              )
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
