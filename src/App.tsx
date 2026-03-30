import { ProjectProvider } from '@/store/ProjectContext'
import { EditorProvider } from '@/store/EditorContext'
import { GlossaryProvider } from '@/store/GlossaryContext'
import { AppShell } from '@/components/layout/AppShell'
import { TooltipProvider } from '@radix-ui/react-tooltip'

export default function App() {
  return (
    <TooltipProvider>
      <ProjectProvider>
        <EditorProvider>
          <GlossaryProvider>
            <AppShell />
          </GlossaryProvider>
        </EditorProvider>
      </ProjectProvider>
    </TooltipProvider>
  )
}
