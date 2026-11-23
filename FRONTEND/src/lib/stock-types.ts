export type Stock = {
  id: string
  symbol: string
  name: string
  price: number
  prevClose: number
  change: number
  changePercent: number
  direction: "up" | "down" | "flat"
}

export type Holding = {
  id: string
  symbol: string
  name: string
  quantity: number
  averagePrice: number
  currentPrice: number
  prevClose: number
  dailyChange: number
  dailyChangePercent: number
  dailyDirection: "up" | "down" | "flat"
  totalValue: number
  totalCost: number
  totalChange: number
  totalChangePercent: number
  direction: "up" | "down" | "flat"
}

export type MarketStatus = {
  exchange: string
  holiday: string | null
  isOpen: boolean
  session: string | null
  reason?: string | null
  timezone: string
  t: number
}

export interface CompanyProfile {
  country: string
  currency: string
  exchange: string
  finnhubIndustry: string
  ipo: string
  logo: string
  marketCapitalization: number
  name: string
  phone: string
  shareOutstanding: number
  ticker: string
  weburl: string
  naicsSubsector?: string
  naicsSector?: string
  gsector?: string
}

export type MarketType = "nasdaq"
