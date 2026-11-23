"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, StickyNote, Trash2, X, Pencil, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface Note {
  id: number
  content: string
  created_at: string
}

interface NotesCardProps {
  userId: string | null
}

export function NotesCard({ userId }: NotesCardProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [open, setOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newNote, setNewNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState("")

  useEffect(() => {
    if (!userId) return
    fetchNotes()
  }, [userId])

  const fetchNotes = async () => {
    try {
      const response = await fetch(`/api/notes/${userId}`)
      if (response.ok) {
        const data = await response.json()
        setNotes(data)
      }
    } catch (error) {
      console.error("Failed to fetch notes", error)
    }
  }

  const addNote = async () => {
    if (!newNote.trim() || !userId) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/notes/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote })
      })
      
      if (response.ok) {
        await fetchNotes()
        setNewNote("")
        setIsAdding(false)
      }
    } catch (error) {
      console.error("Failed to add note", error)
    } finally {
      setLoading(false)
    }
  }

  const deleteNote = async (noteId: number) => {
    if (!userId) return
    
    try {
      const response = await fetch(`/api/notes/${userId}/${noteId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId))
      }
    } catch (error) {
      console.error("Failed to delete note", error)
    }
  }

  const updateNote = async (noteId: number) => {
    if (!userId || !editContent.trim()) return
    
    try {
      const response = await fetch(`/api/notes/${userId}/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent })
      })
      
      if (response.ok) {
        setNotes(prev => prev.map(n => 
          n.id === noteId ? { ...n, content: editContent } : n
        ))
        setEditingId(null)
        setEditContent("")
      }
    } catch (error) {
      console.error("Failed to update note", error)
    }
  }

  const startEditing = (note: Note) => {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditContent("")
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="flex w-fit p-[3px] rounded-2xl cursor-pointer transition-colors hover:bg-black/20 dark:hover:bg-white/20">
            <div className="rounded-2xl w-full p-1 md:p-1.5">
              <a
                title="Notes"
                className="text-light-blue-light hover:text-black dark:text-gray-400 inline-flex items-center p-1.5 font-medium rounded-full text-sm text-center relative"
              >
                <StickyNote className="w-4 h-4" />
                {notes.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-muted-foreground/60 text-background text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                    {notes.length}
                  </span>
                )}
              </a>
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent 
          className="w-80 mb-2 mr-2 p-3 bg-background/95 backdrop-blur-sm border-border/50" 
          side="left" 
          align="end"
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Notes</span>
                {notes.length > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {notes.length}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Add Note Form */}
            <AnimatePresence>
              {isAdding && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Write your note here..."
                    className="w-full min-h-[80px] p-2 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAdding(false)
                        setNewNote("")
                      }}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={addNote}
                      disabled={loading || !newNote.trim()}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Notes List */}
            {notes.length > 0 ? (
              <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1">
                {notes.map((note, index) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="group relative p-2.5 rounded-lg border border-border/30 bg-muted/10 hover:bg-muted/20 transition-colors"
                  >
                    {editingId === note.id ? (
                      /* Edit Mode */
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full min-h-[60px] p-2 text-xs rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-muted-foreground"
                          autoFocus
                        />
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={cancelEditing}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-emerald-500 hover:text-emerald-400"
                            onClick={() => updateNote(note.id)}
                            disabled={!editContent.trim()}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-muted-foreground font-medium mb-1">
                            {formatDate(note.created_at)}
                          </p>
                          <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
                            {note.content}
                          </p>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                            onClick={() => startEditing(note)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-red-500"
                            onClick={() => deleteNote(note.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : !isAdding ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">No notes yet</p>
                <p className="text-xs text-muted-foreground">Click + to add your first note</p>
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
