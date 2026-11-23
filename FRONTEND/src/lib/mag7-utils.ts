// MAG7 utilities for segment data management

const MAG7_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]

export function isMag7(symbol: string): boolean {
  return MAG7_SYMBOLS.includes(symbol.toUpperCase())
}

export interface SegmentStatus {
  symbol: string
  isMag7: boolean
  hasData: boolean
  hasProduct: boolean
  hasGeographic: boolean
  latestDate: string | null
}

export async function checkSegmentStatus(symbol: string): Promise<SegmentStatus> {
  try {
    const response = await fetch(`/api/mag7/segments-status/${symbol}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    console.error(`Failed to check segment status for ${symbol}:`, error)
    return {
      symbol,
      isMag7: isMag7(symbol),
      hasData: false,
      hasProduct: false,
      hasGeographic: false,
      latestDate: null
    }
  }
}

export async function triggerSegmentsFetch() {
  try {
    const response = await fetch("/api/mag7/fetch-segments", { method: "POST" })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    console.error("Failed to trigger segments fetch:", error)
    throw error
  }
}

export const MAG7_COMPANIES = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" }
]
