import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { generateId } from '@/utils/idHelpers'
import { createProject, setLastProjectId } from '@/db/operations'
import { useProject } from '@/store/ProjectContext'
import { GAMES, DEFAULT_GAME, type GameId } from '@/games'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewProjectDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [game, setGame] = useState<GameId>(DEFAULT_GAME)
  const [loading, setLoading] = useState(false)
  const { dispatch } = useProject()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setGame(DEFAULT_GAME)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || loading) return
    setLoading(true)
    try {
      const id = generateId()
      const project = await createProject(trimmed, id, game)
      await setLastProjectId(id)
      dispatch({ type: 'ADD_PROJECT', payload: project })
      dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project })
      dispatch({ type: 'SET_FILES', payload: [] })
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">New Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Game</label>
            <div className="grid grid-cols-2 gap-2">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGame(g.id)}
                  className={cn(
                    'rounded border px-3 py-2 text-left text-sm transition-colors',
                    game === g.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-input bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {g.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Определяет формат файлов, защищаемые коды, подсветку и промпт. Менять после создания нельзя.
            </p>
          </div>
          <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Project name
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. Droid Mod Translation"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
