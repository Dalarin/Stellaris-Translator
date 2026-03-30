import { useCallback, useState } from 'react'
import JSZip from 'jszip'
import { serializeToStellaris, getExportPath } from '@/parser/stellarisSerializer'
import type { TranslationFile, Project } from '@/types'

export function useExport() {
  const [exporting, setExporting] = useState(false)

  const exportProject = useCallback(
    async (project: Project, files: TranslationFile[], targetLanguage = 'russian') => {
      setExporting(true)
      try {
        const zip = new JSZip()

        for (const file of files) {
          const content = serializeToStellaris(file, targetLanguage)
          const exportPath = getExportPath(file.relativePath, file.language, targetLanguage)
          // Add UTF-8 BOM for Stellaris compatibility
          zip.file(exportPath, '\uFEFF' + content)
        }

        const blob = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        })

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${project.name}_${targetLanguage}_translation.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } finally {
        setExporting(false)
      }
    },
    []
  )

  const exportSingleFile = useCallback(
    (file: TranslationFile, targetLanguage = 'russian') => {
      const content = '\uFEFF' + serializeToStellaris(file, targetLanguage)
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const exportPath = getExportPath(file.relativePath, file.language, targetLanguage)
      a.download = exportPath.split('/').pop() || 'export.yml'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    []
  )

  return { exporting, exportProject, exportSingleFile }
}
