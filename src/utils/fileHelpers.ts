import type { TranslationFile, TreeNode, FileStats } from '@/types'
import { calcFileStats } from './progressCalc'

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function buildFileTree(files: TranslationFile[]): TreeNode[] {
  const root: Record<string, TreeNode> = {}

  for (const file of files) {
    const parts = normalizePath(file.relativePath).split('/')
    let currentLevel = root
    let currentPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLast = i === parts.length - 1

      if (!currentLevel[currentPath]) {
        if (isLast) {
          currentLevel[currentPath] = {
            name: part,
            path: currentPath,
            type: 'file',
            fileId: file.id,
            stats: calcFileStats(file),
          }
        } else {
          currentLevel[currentPath] = {
            name: part,
            path: currentPath,
            type: 'folder',
            children: [],
          }
        }
      }

      if (!isLast && currentLevel[currentPath].type === 'folder') {
        if (!currentLevel[currentPath]._childMap) {
          currentLevel[currentPath]._childMap = {}
        }
        currentLevel = currentLevel[currentPath]._childMap!
      }
    }
  }

  function collectNodes(nodeMap: Record<string, TreeNode>): TreeNode[] {
    return Object.values(nodeMap)
      .map((node) => {
        if (node.type === 'folder' && node._childMap) {
          node.children = collectNodes(node._childMap)
          delete node._childMap
          // compute folder stats from children
          node.stats = aggregateStats(node.children)
        }
        return node
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  return collectNodes(root)
}

function aggregateStats(nodes: TreeNode[]): FileStats {
  const stats: FileStats = { approved: 0, translated: 0, outdated: 0, missing: 0, total: 0 }
  for (const node of nodes) {
    if (node.stats) {
      stats.approved += node.stats.approved
      stats.translated += node.stats.translated
      stats.outdated += node.stats.outdated
      stats.missing += node.stats.missing
      stats.total += node.stats.total
    }
  }
  return stats
}

// Extend TreeNode with internal child map for building
declare module '@/types' {
  interface TreeNode {
    _childMap?: Record<string, TreeNode>
  }
}

export function getFilenameWithoutExtension(path: string): string {
  const base = path.split('/').pop() || path
  return base.replace(/\.[^.]+$/, '')
}

export function collectAllFiles(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ''
): Promise<Map<string, File>> {
  return _collectFiles(dirHandle, prefix)
}

async function _collectFiles(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string
): Promise<Map<string, File>> {
  const result = new Map<string, File>()
  for await (const [name, handle] of (dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    const fullPath = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      if (name.endsWith('.yml') || name.endsWith('.yaml')) {
        const file = await (handle as FileSystemFileHandle).getFile()
        result.set(fullPath, file)
      }
    } else if (handle.kind === 'directory') {
      const sub = await _collectFiles(handle as FileSystemDirectoryHandle, fullPath)
      for (const [k, v] of sub) result.set(k, v)
    }
  }
  return result
}

export function collectFilesFromInput(fileList: FileList): Map<string, File> {
  const result = new Map<string, File>()
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i]
    // webkitRelativePath = "rootFolder/sub/file.yml"
    // strip the top-level folder name
    const parts = file.webkitRelativePath.split('/')
    const relativePath = parts.slice(1).join('/')
    if (relativePath.endsWith('.yml') || relativePath.endsWith('.yaml')) {
      result.set(relativePath, file)
    }
  }
  return result
}
