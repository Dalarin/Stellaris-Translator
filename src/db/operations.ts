import { db } from './schema'
import type { Project, TranslationFile, GlossaryEntry } from '@/types'

// --- Projects ---

export async function getProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function createProject(name: string, id: string): Promise<Project> {
  const now = new Date()
  const project: Project = { id, name, createdAt: now, updatedAt: now }
  await db.projects.add(project)
  return project
}

export async function updateProjectTimestamp(id: string): Promise<void> {
  await db.projects.update(id, { updatedAt: new Date() })
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.translationFiles, db.glossaryEntries, async () => {
    await db.projects.delete(id)
    await db.translationFiles.where('projectId').equals(id).delete()
    await db.glossaryEntries.where('projectId').equals(id).delete()
  })
}

// --- Translation Files ---

export async function getFilesForProject(projectId: string): Promise<TranslationFile[]> {
  return db.translationFiles.where('projectId').equals(projectId).toArray()
}

export async function upsertTranslationFile(file: TranslationFile): Promise<void> {
  await db.translationFiles.put(file)
  await updateProjectTimestamp(file.projectId)
}

export async function upsertTranslationFiles(files: TranslationFile[]): Promise<void> {
  if (files.length === 0) return
  await db.transaction('rw', db.translationFiles, db.projects, async () => {
    await db.translationFiles.bulkPut(files)
    if (files[0]) await updateProjectTimestamp(files[0].projectId)
  })
}

// --- Glossary ---

export async function getGlossaryForProject(projectId: string): Promise<GlossaryEntry[]> {
  return db.glossaryEntries.where('projectId').equals(projectId).toArray()
}

export async function upsertGlossaryEntries(entries: GlossaryEntry[]): Promise<void> {
  await db.glossaryEntries.bulkPut(entries)
}

export async function deleteGlossaryEntry(id: string): Promise<void> {
  await db.glossaryEntries.delete(id)
}

// --- Meta ---

export async function getLastProjectId(): Promise<string | null> {
  const record = await db.meta.get('lastProjectId')
  return record?.value ?? null
}

export async function setLastProjectId(id: string): Promise<void> {
  await db.meta.put({ key: 'lastProjectId', value: id })
}
