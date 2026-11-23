"use client"

import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { User, Settings, LogOut } from "lucide-react"
import { NotesCard } from "./notes-card"
import { AlertsCard } from "./alerts-card"
import { useNavigate } from "react-router-dom"

interface FloatingActionMenuProps {
  userId: string | null
  onCreateAlert?: () => void
}

export function FloatingActionMenu({ userId, onCreateAlert }: FloatingActionMenuProps) {
  const [isHovered, setIsHovered] = useState(false)
  const navigate = useNavigate()
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => setIsHovered(false), 200)
  }

  const handleLogout = () => {
    localStorage.removeItem("userId")
    navigate("/login")
  }

  // Staggered animation variants for child items
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.05,
      }
    },
    exit: {
      opacity: 0,
      transition: {
        staggerChildren: 0.03,
        staggerDirection: -1,
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 12, scale: 0.8 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring" as const, stiffness: 400, damping: 25 }
    },
    exit: {
      opacity: 0,
      y: 8,
      scale: 0.85,
      transition: { duration: 0.15 }
    }
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main trigger - User icon */}
      <motion.div
        className="relative flex items-center justify-center w-11 h-11 rounded-full cursor-pointer z-50"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label="User action menu"
        style={{
          background: "linear-gradient(135deg, rgba(16,16,16,0.95) 0%, rgba(30,30,30,0.95) 100%)",
          boxShadow: isHovered
            ? "0 0 20px rgba(168, 85, 247, 0.25), 0 8px 32px rgba(0,0,0,0.5)"
            : "0 4px 20px rgba(0,0,0,0.4)",
          border: isHovered ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <User className={`h-[18px] w-[18px] transition-colors duration-300 ${isHovered ? 'text-purple-400' : 'text-white/60'}`} />

        {/* Glow ring on hover */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)",
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Expanded action items */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col items-end gap-2 pb-3"
          >
            {userId ? (
              <>
                {/* Settings / Profile */}
                <motion.div variants={itemVariants}>
                  <div
                    className="rounded-xl transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, rgba(16,16,16,0.92) 0%, rgba(28,28,28,0.92) 100%)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div
                      className="flex w-fit p-[3px] rounded-2xl cursor-pointer transition-colors hover:bg-black/20 dark:hover:bg-white/20"
                      onClick={() => navigate("/profile")}
                      title="Settings"
                    >
                      <div className="rounded-2xl w-full p-1 md:p-1.5">
                        <span className="text-light-blue-light hover:text-black dark:text-gray-400 inline-flex items-center p-1.5 font-medium rounded-full text-sm text-center">
                          <Settings className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Notes */}
                <motion.div variants={itemVariants}>
                  <div
                    className="rounded-xl transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, rgba(16,16,16,0.92) 0%, rgba(28,28,28,0.92) 100%)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    }}
                  >
                    <NotesCard userId={userId} />
                  </div>
                </motion.div>

                {/* Alerts */}
                <motion.div variants={itemVariants}>
                  <div
                    className="rounded-xl transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, rgba(16,16,16,0.92) 0%, rgba(28,28,28,0.92) 100%)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    }}
                  >
                    <AlertsCard userId={userId} onCreateAlert={onCreateAlert} />
                  </div>
                </motion.div>

                {/* Logout */}
                <motion.div variants={itemVariants}>
                  <div
                    className="rounded-xl transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, rgba(16,16,16,0.92) 0%, rgba(28,28,28,0.92) 100%)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div
                      className="flex w-fit p-[3px] rounded-2xl cursor-pointer transition-colors hover:bg-black/20 dark:hover:bg-white/20"
                      onClick={handleLogout}
                      title="Log Out"
                    >
                      <div className="rounded-2xl w-full p-1 md:p-1.5">
                        <span className="text-red-400/60 hover:text-red-400 inline-flex items-center p-1.5 font-medium rounded-full text-sm text-center transition-colors">
                          <LogOut className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </>
            ) : (
              <>
                <motion.div variants={itemVariants}>
                  <motion.button
                    whileHover={{ scale: 1.05, x: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate("/login")}
                    className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl transition-all duration-200 group"
                    style={{
                      background: "linear-gradient(135deg, rgba(16,16,16,0.92) 0%, rgba(28,28,28,0.92) 100%)",
                      backdropFilter: "blur(16px)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    }}
                    title="Sign In"
                  >
                    <User className="h-4 w-4 text-white/50 group-hover:text-white/90 transition-colors" />
                    <span className="text-xs text-white/50 group-hover:text-white/90 font-medium transition-colors">Sign In</span>
                  </motion.button>
                </motion.div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
