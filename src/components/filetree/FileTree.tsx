import { useProject } from '@/store/ProjectContext'
import { useEditor } from '@/store/EditorContext'
import { FileTreeNode } from './FileTreeNode'

export function FileTree() {
  const { state, getFileById } = useProject()
  const { state: editorState, dispatch: editorDispatch } = useEditor()

  function handleFileClick(fileId: string) {
    const file = getFileById(fileId)
    if (file) editorDispatch({ type: 'SET_ACTIVE_FILE', payload: file })
  }

  if (state.fileTree.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No files imported yet.
      </div>
    )
  }

  return (
    <div className="py-1">
      {state.fileTree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          activeFileId={editorState.activeFile?.id ?? null}
          onFileClick={handleFileClick}
        />
      ))}
    </div>
  )
}
