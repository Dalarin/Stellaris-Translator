import { useState } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react'
import type { TreeNode } from '@/types'
import { FileProgress } from './FileProgress'
import { cn } from '@/lib/utils'

interface Props {
  node: TreeNode
  depth: number
  activeFileId: string | null
  onFileClick: (fileId: string) => void
}

export function FileTreeNode({ node, depth, activeFileId, onFileClick }: Props) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (node.type === 'file') {
    const isActive = node.fileId === activeFileId
    return (
      <button
        onClick={() => node.fileId && onFileClick(node.fileId)}
        className={cn(
          'flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors hover:bg-accent/10 rounded',
          isActive && 'bg-accent/20 text-primary',
          !isActive && 'text-foreground/80'
        )}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        <FileText size={12} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{node.name}</span>
        {node.stats && node.stats.total > 0 && <FileProgress stats={node.stats} />}
      </button>
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
