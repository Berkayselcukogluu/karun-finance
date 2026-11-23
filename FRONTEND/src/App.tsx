import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom"
import { useState } from "react"
import { StockTickerPage } from "@/components/stock-ticker-page"
import { StockDetailPage } from "@/components/stock-detail-page"
import { SignupForm } from "@/components/signup-form"
import { LoginForm } from "@/components/login-form"
import { ProfilePage } from "@/components/profile-page"
import { FloatingActionMenu } from "@/components/floating-action-menu"
import { AiChatbot } from "@/components/ai-chatbot"
import { WorldMap } from "@/components/ui/world-map"
import { CreateAlertModal } from "@/components/create-alert-modal"

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup"
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false)

  const userId = typeof window !== 'undefined' ? localStorage.getItem("userId") : null

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="fixed inset-0 z-[-10] pointer-events-none" aria-hidden="true">
        <WorldMap
          dots={[
            {
              start: { lat: 40.7128, lng: -74.0060 }, // New York
              end: { lat: 51.5074, lng: -0.1278 }, // London
            },
            {
              start: { lat: 51.5074, lng: -0.1278 }, // London
              end: { lat: 35.6762, lng: 139.6503 }, // Tokyo
            },
            {
              start: { lat: 35.6762, lng: 139.6503 }, // Tokyo
              end: { lat: -33.8688, lng: 151.2093 }, // Sydney
            },
            {
              start: { lat: -33.8688, lng: 151.2093 }, // Sydney
              end: { lat: 40.7128, lng: -74.0060 }, // New York
            },
            {
              start: { lat: 40.7128, lng: -74.0060 }, // New York
              end: { lat: 34.0522, lng: -118.2437 }, // Los Angeles
            },
            {
              start: { lat: 41.0082, lng: 28.9784 }, // Istanbul
              end: { lat: 51.5074, lng: -0.1278 }, // London
            },
            {
              start: { lat: 41.0082, lng: 28.9784 }, // Istanbul
              end: { lat: 40.7128, lng: -74.0060 }, // New York
            },
          ]}
          lineColor="#ae3ad11a"
        />
      </div>
      <div id="main-content" className="relative z-10">
        {children}
        {!isAuthPage && (
          <>
            <FloatingActionMenu
              userId={userId}
              onCreateAlert={() => setIsAlertModalOpen(true)}
            />
            <AiChatbot />
          </>
        )}
        {!isAuthPage && userId && (
          <CreateAlertModal
            isOpen={isAlertModalOpen}
            onClose={() => setIsAlertModalOpen(false)}
            userId={userId}
            marketType="nasdaq"
          />
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* US Market Routes */}
          <Route path="/" element={<StockTickerPage />} />
          <Route path="/:symbol" element={<StockDetailPage />} />

          {/* Auth Routes */}
          <Route path="/login" element={
            <div className="min-h-screen flex items-center justify-center">
              <LoginForm />
            </div>
          } />
          <Route path="/signup" element={
            <div className="min-h-screen flex items-center justify-center">
              <SignupForm />
            </div>
          } />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
