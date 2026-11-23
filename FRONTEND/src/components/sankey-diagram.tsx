import { useEffect, useMemo, useState, memo, useCallback } from 'react';
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

export type SegmentType = 'product' | 'geographic';

interface SegmentItem { name: string; amount: number }
interface ApiResponseSingle {
  symbol: string;
  type: SegmentType;
  periodDate: string | null;
  currency: string;
  segments: SegmentItem[];
}

const formatAmount = (n: number, currency: string): string => {
  if (n === null || n === undefined) return '-';
  const abs = Math.abs(n);
  const suffix = abs >= 1_000_000_000 ? 'B' : abs >= 1_000_000 ? 'M' : abs >= 1_000 ? 'K' : '';
  const div = suffix === 'B' ? 1_000_000_000 : suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  const val = n / div;
  return `${currency} ${val.toFixed(val >= 100 ? 0 : 2)}${suffix}`;
};

const buildSankeyData = (segments: SegmentItem[], currency: string) => {
  const nodes = [{ name: 'Revenue' }, ...segments.slice(0, 20).map(s => ({ name: s.name }))];
  const links = segments.slice(0, 20).map((s, i) => ({ source: 0, target: i + 1, value: Math.max(0, s.amount) }));
  const tooltip = (v: number) => formatAmount(v, currency);
  return { nodes, links, tooltip };
};

const SankeyDiagramComponent = ({ symbol, type = 'product', height = 360 }: { symbol: string; type?: SegmentType; height?: number }) => {
  const [data, setData] = useState<ApiResponseSingle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/revenue-segments/${symbol}?type=${type}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [symbol, type]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const graph = useMemo(() => {
    if (!data?.segments?.length) return null;
    return buildSankeyData(data.segments, data.currency || 'USD');
  }, [data]);

  const title = useMemo(() => {
    const typeLabel = type === 'product' ? 'Product' : 'Geographic';
    return `Revenue Segmentation (${typeLabel})`;
  }, [type]);

  if (!data?.segments?.length) {
    return (
      <div className="w-full bg-neutral-900/30 rounded-lg p-4">
        <div className="text-center py-8 flex flex-col items-center justify-center gap-3">
          {loading && (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <div className="text-sm text-muted-foreground">Loading segments…</div>
            </>
          )}
          {error && <div className="text-sm text-red-500">{error}</div>}
          {!loading && !error && <div className="text-sm text-muted-foreground">No segment data available</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-neutral-900/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm md:text-base font-semibold">
          {data.symbol} {title}
        </h3>
        <div className="text-xs text-muted-foreground">{data.periodDate || 'N/A'} • {data.currency}</div>
      </div>
      <div style={{ width: '100%', height: `${height}px` }} className="min-h-80">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={graph as any}
            nodePadding={Math.max(12, height / 30)}
            nodeWidth={10}
            iterations={32}
            link={{ stroke: 'rgba(96, 165, 250, 0.4)', strokeOpacity: 0.5 }}
            node={{ fill: 'rgba(147, 197, 253, 0.8)', stroke: 'rgba(96, 165, 250, 0.6)', strokeWidth: 1 }}
            margin={{ left: 15, right: 15, top: 10, bottom: 10 }}
          >
            <Tooltip 
              formatter={(value: any) => graph ? graph.tooltip(Number(value)) : String(value)}
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(96, 165, 250, 0.3)',
                borderRadius: '6px',
                padding: '8px'
              }}
              cursor={{ stroke: 'rgba(96, 165, 250, 0.6)' }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default memo(SankeyDiagramComponent);
