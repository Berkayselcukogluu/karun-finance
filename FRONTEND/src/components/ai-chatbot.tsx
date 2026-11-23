"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Send, Sparkles, Loader2 } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export function AiChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      })

      if (!response.ok) {
        throw new Error("API error")
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "Sorry, an error occurred.",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Connection error. Please try again.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Floating AI Button - Bottom Left */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle AI Assistant"
        className="fixed bottom-6 left-6 z-50 flex items-center justify-center w-11 h-11 rounded-full cursor-pointer group"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        style={{
          background: isOpen
            ? "linear-gradient(135deg, rgba(168,85,247,0.9) 0%, rgba(124,58,237,0.9) 100%)"
            : "linear-gradient(135deg, rgba(16,16,16,0.95) 0%, rgba(30,30,30,0.95) 100%)",
          boxShadow: isOpen
            ? "0 0 24px rgba(168,85,247,0.4), 0 8px 32px rgba(0,0,0,0.5)"
            : "0 4px 20px rgba(0,0,0,0.4)",
          border: isOpen ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.08)",
        }}
        title="AI Assistant"
      >
        {isOpen ? (
          <X className="h-[18px] w-[18px] text-white" />
        ) : (
          <Sparkles className="h-[18px] w-[18px] text-purple-400 group-hover:text-purple-300 transition-colors" />
        )}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95 }}
            transition={{ type: "spring" as const, stiffness: 350, damping: 30 }}
            className="fixed bottom-20 left-6 z-50 w-[380px] h-[520px] flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "rgba(10, 10, 10, 0.85)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(124,58,237,0.2))" }}>
                <Sparkles className="h-4 w-4 text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white/90">AI Assistant</h3>
                <p className="text-[10px] text-white/40">Powered by GPT</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close AI Assistant"
                className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(124,58,237,0.08))" }}>
                    <Sparkles className="h-7 w-7 text-purple-400/70" />
                  </div>
                  <p className="text-sm text-white/50 font-medium mb-1">Hello! 👋</p>
                  <p className="text-xs text-white/30 max-w-[240px] leading-relaxed">
                    Ask me anything about US stocks, ETFs, or market analysis.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-br-md text-white"
                        : "rounded-bl-md text-white/85"
                    }`}
                    style={{
                      background: msg.role === "user"
                        ? "linear-gradient(135deg, rgba(168,85,247,0.55) 0%, rgba(124,58,237,0.45) 100%)"
                        : "rgba(255,255,255,0.06)",
                      border: msg.role === "user"
                        ? "1px solid rgba(168,85,247,0.3)"
                        : "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div
                    className="px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-2"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <Loader2 className="h-3.5 w-3.5 text-purple-400 animate-spin" />
                    <span className="text-xs text-white/40">Thinking...</span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
              className="px-3 py-3 border-t"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 outline-none border-none py-1.5"
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  aria-label="Send message"
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                  style={{
                    background: input.trim() && !isLoading ? "rgba(168,85,247,0.3)" : "transparent",
                  }}
                >
                  <Send className="h-4 w-4 text-purple-400" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
