"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowUpDown, Plus, Trash2, Search, Briefcase, Banknote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SplitFlapText } from "./split-flap-text"
import { DirectionIcon } from "./direction-icon"
import type { Holding } from "@/lib/stock-types"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"

interface HoldingsTableProps {
  holdings: Holding[]
  cashBalance: number
  onAddHolding: (symbol: string, quantity: number, averagePrice: number) => void
  onRemoveHolding: (symbol: string) => void
  onUpdateCash: (amount: number) => void
  onUpdateHolding: (symbol: string, quantity: number, averagePrice: number) => void
  soundEnabled: boolean
}

// Inline editable cell component
function EditableCell({
  value,
  onSave,
  prefix = "",
  suffix = "",
  isDoubleClick = false,
  customClass = "",
  allowZero = true,
  min = 0,
}: {
  value: number
  onSave: (newValue: number) => void
  prefix?: string
  suffix?: string
  isDoubleClick?: boolean
  customClass?: string
  allowZero?: boolean
  min?: number
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value.toString())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    setEditValue(value.toString())
  }, [value])

  const handleSave = () => {
    const trimmed = editValue.trim()
    const newValue = parseFloat(trimmed)
    if (!isNaN(newValue)) {
      const isValid = allowZero ? newValue >= min : newValue > min
      if (isValid) {
        onSave(newValue)
      } else {
        setEditValue(value.toString())
      }
    } else {
      setEditValue(value.toString())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(value.toString())
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        step="any"
        min={min}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-24 text-sm font-mono px-1.5 text-center bg-background border-primary focus-visible:ring-1"
      />
    )
  }

  const handlers = isDoubleClick
    ? { onDoubleClick: () => setIsEditing(true) }
    : { onClick: () => setIsEditing(true) }

  return (
    <span
      {...handlers}
      className={customClass || "text-sm font-mono text-muted-foreground cursor-pointer hover:text-foreground hover:bg-muted/50 px-2 py-1 rounded transition-colors inline-block"}
      title={isDoubleClick ? "Double-click to edit" : "Click to edit"}
    >
      {prefix}{value.toFixed(2)}{suffix}
    </span>
  )
}

const columnHelper = createColumnHelper<Holding>()

export function HoldingsTable({ holdings, cashBalance, onAddHolding, onRemoveHolding, onUpdateCash, onUpdateHolding, soundEnabled }: HoldingsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [newSymbol, setNewSymbol] = useState("")
  const [newQuantity, setNewQuantity] = useState("")
  const [newAvgPrice, setNewAvgPrice] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)

  const columns = useMemo(
    () => [
      columnHelper.accessor("symbol", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Symbol
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <Link to={`/${row.original.symbol}`} className="flex items-center gap-2 hover:underline cursor-pointer">
            <DirectionIcon direction={row.original.direction} />
            <SplitFlapText
              value={row.original.symbol}
              charset="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
              direction={row.original.direction}
            />
          </Link>
        ),
      }),
      columnHelper.accessor("name", {
        header: () => <span className="text-xs font-semibold text-muted-foreground">Name</span>,
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground truncate max-w-[100px] block">{getValue()}</span>
        ),
      }),
      columnHelper.accessor("currentPrice", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Last Price
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <SplitFlapText
            value={`$${row.original.currentPrice.toFixed(2)}`}
            charset="0123456789.$"
            direction={row.original.direction}
          />
        ),
      }),
      columnHelper.accessor("averagePrice", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Avg Price
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <EditableCell
            value={row.original.averagePrice}
            prefix="$"
            onSave={(newValue) => onUpdateHolding(row.original.symbol, row.original.quantity, newValue)}
          />
        ),
      }),
      columnHelper.accessor("quantity", {
        header: () => <span className="text-xs font-semibold text-muted-foreground">Qty</span>,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.quantity}
            onSave={(newValue) => onUpdateHolding(row.original.symbol, newValue, row.original.averagePrice)}
          />
        ),
      }),
      columnHelper.accessor("totalValue", {
        header: () => <span className="text-xs font-semibold text-muted-foreground">TV</span>,
        cell: ({ row }) => (
          <span className="text-sm font-mono text-muted-foreground">
            ${row.original.totalValue.toFixed(2)}
          </span>
        ),
      }),
      columnHelper.accessor("totalChangePercent", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Total P/L
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        sortingFn: (rowA, rowB) => {
          return rowA.original.totalChangePercent - rowB.original.totalChangePercent
        },
        cell: ({ row }) => {
          const change = row.original.totalChange
          const changePercent = row.original.totalChangePercent
          const isPositive = change >= 0
          return (
            <div className="flex flex-col">
              <span className={`text-sm font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
              </span>
              <span className={`text-xs ${isPositive ? 'text-green-500/70' : 'text-red-500/70'}`}>
                ({isPositive ? '+' : ''}{change.toFixed(2)}$)
              </span>
            </div>
          )
        },
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="text-xs font-semibold text-muted-foreground">Actions</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemoveHolding(row.original.symbol)}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${row.original.symbol}`}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1} />
          </Button>
        ),
      }),
    ],
    [onRemoveHolding, onUpdateHolding, soundEnabled],
  )

  const table = useReactTable({
    data: holdings,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleAddHolding = () => {
    const qty = parseFloat(newQuantity)
    const avgPrice = parseFloat(newAvgPrice)

    if (newSymbol.trim() && !isNaN(qty) && qty > 0 && !isNaN(avgPrice) && avgPrice > 0) {
      onAddHolding(newSymbol.trim().toUpperCase(), qty, avgPrice)
      setNewSymbol("")
      setNewQuantity("")
      setNewAvgPrice("")
      setShowAddForm(false)
    }
  }

  // Calculate portfolio summary
  const portfolioSummary = useMemo(() => {
    const totalValue = holdings.reduce((sum, h) => sum + h.totalValue, 0) + cashBalance
    const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0) + cashBalance
    const holdingsValue = holdings.reduce((sum, h) => sum + h.totalValue, 0)
    const holdingsCost = holdings.reduce((sum, h) => sum + h.totalCost, 0)
    const totalPL = holdingsValue - holdingsCost
    const totalPLPercent = holdingsCost > 0 ? (totalPL / holdingsCost) * 100 : 0
    return { totalValue, totalCost, totalPL, totalPLPercent, cashBalance }
  }, [holdings, cashBalance])

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Holdings</h2>
          {holdings.length > 0 && (
            <span className={`text-sm font-mono ml-2 ${portfolioSummary.totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ({portfolioSummary.totalPL >= 0 ? '+' : ''}{portfolioSummary.totalPL.toFixed(2)}$ / {portfolioSummary.totalPLPercent >= 0 ? '+' : ''}{portfolioSummary.totalPLPercent.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter holdings..."
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 h-8 w-40 text-sm"
          />
        </div>
      </div>

      {/* Add Holding Form */}
      <div className="flex gap-2 flex-wrap">
        {!showAddForm && (
          <>
            <Button onClick={() => setShowAddForm(true)} size="sm" className="h-9 gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Add Holding</span>
            </Button>
          </>
        )}
      </div>

      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex flex-wrap gap-2 items-end p-3 rounded-lg border border-border bg-muted/20"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Symbol</label>
            <Input
              placeholder="e.g., AAPL"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              className="h-9 w-24 text-sm uppercase"
              maxLength={5}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Quantity</label>
            <Input
              type="number"
              placeholder="0.00"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              className="h-9 w-24 text-sm"
              min="0"
              step="0.01"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Avg. Price ($)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={newAvgPrice}
              onChange={(e) => setNewAvgPrice(e.target.value)}
              className="h-9 w-28 text-sm"
              min="0"
              step="0.01"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddHolding} size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
            <Button onClick={() => setShowAddForm(false)} size="sm" variant="outline" className="h-9">
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      <div className="rounded-lg bg-[#0A0A0A]/70 backdrop-blur-md border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border bg-muted/30">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="py-2 px-3 text-left">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {table.getRowModel().rows.map((row, index) => (
                  <motion.tr
                    key={row.original.symbol}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.2 }}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2 px-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {table.getRowModel().rows.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No holdings yet. Add your first position above!
          </div>
        )}
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 rounded-lg border border-border bg-muted/10">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Total Value</p>
          <p className="text-sm font-mono font-semibold">${portfolioSummary.totalValue.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Asset CV</p>
          <p className="text-sm font-mono">${(portfolioSummary.totalValue - cashBalance).toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Holdings Cost</p>
          <p className="text-sm font-mono">${(portfolioSummary.totalCost - cashBalance).toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1" title="Click to update cash balance">
            <Banknote className="h-3 w-3 text-green-500" />
            Cash
          </p>
          <div className="text-sm font-mono mt-0.5">
            <EditableCell
              value={cashBalance}
              prefix="$"
              onSave={onUpdateCash}
              allowZero={true}
              min={0}
              isDoubleClick={false}
              customClass="text-green-500 font-semibold cursor-pointer hover:bg-green-500/10 hover:border-green-500/30 border border-dashed border-green-500/20 px-2.5 py-0.5 rounded transition-all inline-flex items-center justify-center min-w-[60px]"
            />
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Total P/L</p>
          <p className={`text-sm font-mono font-semibold ${portfolioSummary.totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {portfolioSummary.totalPL >= 0 ? '+' : ''}{portfolioSummary.totalPL.toFixed(2)}$
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">P/L %</p>
          <p className={`text-sm font-mono font-semibold ${portfolioSummary.totalPLPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {portfolioSummary.totalPLPercent >= 0 ? '+' : ''}{portfolioSummary.totalPLPercent.toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  )
}
