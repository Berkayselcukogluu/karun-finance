"use client"

import { useState, useMemo, memo, useEffect } from 'react'
import SankeyDiagram from './sankey-diagram'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { isMag7, checkSegmentStatus, triggerSegmentsFetch, type SegmentStatus } from '@/lib/mag7-utils'
import { BarChart3, RefreshCw, AlertCircle } from 'lucide-react'

interface MAG7SegmentsPanelProps {
  symbol: string
  showTabs?: boolean
}

const MAG7SegmentsPanel = memo(({ symbol, showTabs = true }: MAG7SegmentsPanelProps) => {
  const [activeSegmentType, setActiveSegmentType] = useState<'product' | 'geographic'>('product')
  const [segmentStatus, setSegmentStatus] = useState<SegmentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)

  const isMag7Symbol = useMemo(() => isMag7(symbol), [symbol])

  useEffect(() => {
    if (!isMag7Symbol) return

    const checkStatus = async () => {
      setLoading(true)
      const status = await checkSegmentStatus(symbol)
      setSegmentStatus(status)
      setLoading(false)
    }

    checkStatus()
  }, [symbol, isMag7Symbol])

  const handleFetchSegments = async () => {
    try {
      setFetching(true)
      const result = await triggerSegmentsFetch()
      console.log('Fetch triggered:', result)
      // Re-check status after a delay
      setTimeout(async () => {
        const status = await checkSegmentStatus(symbol)
        setSegmentStatus(status)
        setFetching(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to trigger fetch:', error)
      setFetching(false)
    }
  }

  if (!isMag7Symbol) {
    return null
  }

  if (loading) {
    return (
      <Card className="border-white/10 bg-neutral-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Revenue Segments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground animate-pulse">Loading segment status...</div>
        </CardContent>
      </Card>
    )
  }

  const hasData = segmentStatus?.hasData ?? false

  return (
    <Card className="border-white/10 bg-neutral-900/40">
      <CardHeader className="pb-3 flex items-center justify-between">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Revenue Segments
        </CardTitle>
        {hasData && (
          <span className="text-xs text-emerald-500/80 font-medium">
            {segmentStatus?.latestDate}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData && (
          <div className="flex flex-col gap-3 items-center justify-center py-6 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-amber-500">
              <AlertCircle className="h-4 w-4" />
              No segment data available
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleFetchSegments}
              disabled={fetching}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              {fetching ? 'Fetching...' : 'Fetch Segments'}
            </Button>
          </div>
        )}
        {showTabs && hasData && (
          <Tabs value={activeSegmentType} onValueChange={(v) => setActiveSegmentType(v as 'product' | 'geographic')}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="product" disabled={!segmentStatus?.hasProduct}>
                Product
              </TabsTrigger>
              <TabsTrigger value="geographic" disabled={!segmentStatus?.hasGeographic}>
                Geographic
              </TabsTrigger>
            </TabsList>
            <TabsContent value="product" className="space-y-4">
              <SankeyDiagram symbol={symbol} type="product" height={400} />
            </TabsContent>
            <TabsContent value="geographic" className="space-y-4">
              <SankeyDiagram symbol={symbol} type="geographic" height={400} />
            </TabsContent>
          </Tabs>
        )}
        {!showTabs && hasData && (
          <SankeyDiagram symbol={symbol} type={activeSegmentType} height={400} />
        )}
      </CardContent>
    </Card>
  )
})

MAG7SegmentsPanel.displayName = 'MAG7SegmentsPanel'

export default MAG7SegmentsPanel
