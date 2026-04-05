import { useState } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, ClipboardCopy, RotateCcw } from 'lucide-react'
import type { TreeNode } from '@/types'
import { FileProgress } from './FileProgress'
import { cn } from '@/lib/utils'
import { useProject } from '@/store/ProjectContext'
import { useEditor } from '@/store/EditorContext'
import { upsertTranslationFile } from '@/db/operations'

interface Props {
  node: TreeNode
  depth: number
  activeFileId: string | null
  onFileClick: (fileId: string) => void
}

export function FileTreeNode({ node, depth, activeFileId, onFileClick }: Props) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [hovered, setHovered] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const { getFileById, dispatch: projectDispatch } = useProject()
  const { state: editorState, dispatch: editorDispatch } = useEditor()

  async function handleReset(e: React.MouseEvent) {
    e.stopPropagation()
    if (!node.fileId) return
    if (!resetConfirm) {
      setResetConfirm(true)
      setTimeout(() => setResetConfirm(false), 3000)
      return
    }
    const file = getFileById(node.fileId)
    if (!file) return
    const resetFile = {
      ...file,
      entries: file.entries.map((entry) => ({
        ...entry,
        translatedText: '',
        status: 'missing' as const,
      })),
    }
    await upsertTranslationFile(resetFile)
    projectDispatch({ type: 'UPDATE_FILE', payload: resetFile })
    if (editorState.activeFile?.id === node.fileId) {
      editorDispatch({ type: 'SYNC_FILE', payload: resetFile })
    }
    setResetConfirm(false)
  }

  function handleFillMissing(e: React.MouseEvent) {
    e.stopPropagation()
    if (!node.fileId) return
    const file = getFileById(node.fileId)
    if (!file) return


    const updatedFile = {
      ...file,
      entries: file.entries.map((entry) =>
        entry.status === 'missing'
          ? { ...entry, translatedText: entry.originalText, status: 'outdated' as const }
          : entry
      ),
    }
    
    projectDispatch({ type: 'UPDATE_FILE', payload: updatedFile })
    if (editorState.activeFile?.id === node.fileId) {
      editorDispatch({ type: 'SYNC_FILE', payload: updatedFile })
    }
  }

  if (node.type === 'file') {
    const isActive = node.fileId === activeFileId
    const hasMissing = (node.stats?.missing ?? 0) > 0
    return (
      <div
        className={cn(
          'group flex w-full items-center gap-1.5 py-1 pr-2 text-xs transition-colors hover:bg-accent/10 rounded cursor-pointer',
          isActive && 'bg-accent/20 text-primary',
          !isActive && 'text-foreground/80'
        )}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        onClick={() => node.fileId && onFileClick(node.fileId)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <FileText size={12} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{node.name}</span>
        {hasMissing && hovered && (
          <button
            onClick={handleFillMissing}
            title={`Fill ${node.stats!.missing} missing entries with original text`}
            className="shrink-0 rounded px-1 py-0.5 text-[10px] flex items-center gap-0.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 transition-colors"
          >
            <ClipboardCopy size={10} />
            Fill
          </button>
        )}
        {hovered && (
          <button
            onClick={handleReset}
            title="Reset all translations in this file"
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[10px] flex items-center gap-0.5 transition-colors',
              resetConfirm
                ? 'bg-red-500/30 text-red-400 hover:bg-red-500/50'
                : 'bg-muted text-muted-foreground hover:bg-red-500/20 hover:text-red-400'
            )}
          >
            <RotateCcw size={10} />
            {resetConfirm ? 'Sure?' : 'Reset'}
          </button>
        )}
        {node.stats && node.stats.total > 0 && <FileProgress stats={node.stats} />}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {expanded ? (
          <ChevronDown size={12} className="shrink-0" />
        ) : (
          <ChevronRight size={12} className="shrink-0" />
        )}
        {expanded ? (
          <FolderOpen size={12} className="shrink-0 text-yellow-500/70" />
        ) : (
          <Folder size={12} className="shrink-0 text-yellow-500/70" />
        )}
        <span className="flex-1 truncate font-medium">{node.name}</span>
        {node.stats && node.stats.total > 0 && <FileProgress stats={node.stats} />}
      </button>
      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
