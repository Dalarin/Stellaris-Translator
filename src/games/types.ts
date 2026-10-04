import type { ParseResult } from '@/parser/locParser'
import type { ColorSegment } from '@/parser/colorCodes'
import type { TranslationFile } from '@/types'

export type GameId = 'stellaris' | 'ck3'

/**
 * Everything that differs between Paradox games: how a file is read and written,
 * which fragments the translation must keep verbatim, how text is styled in the
 * preview, and the prompt the model gets. Register new games in ./index.ts.
 */
export interface GameProfile {
  id: GameId
  name: string
  /** Folder that holds the language folders inside a mod, e.g. localisation/english */
  locFolder: string

  parse(rawText: string): ParseResult
  serialize(file: TranslationFile, targetLanguage: string): string
  exportPath(relativePath: string, sourceLanguage: string, targetLanguage: string): string

  /** Global regex over fragments that must survive translation unchanged ($VAR$, color codes, [scripted]...) */
  tokenRegex: RegExp
  /** Human-readable list of those fragments, used in model prompts */
  tokenHint: string

  colorSegments(text: string): ColorSegment[]
  stripFormatting(text: string): string

  defaultPrompt: string
  /** Earlier built-in prompts; a project that saved one unchanged is moved to the current default */
  legacyPrompts: string[]
}
