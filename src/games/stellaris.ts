import { parseLoc } from '@/parser/locParser'
import { serializeLoc, getExportPath } from '@/parser/locSerializer'
import type { ColorSegment } from '@/parser/colorCodes'
import type { GameProfile } from './types'

const COLOR_MAP: Record<string, string | null> = {
  Y: '#FFD700',
  R: '#E05050',
  G: '#50E050',
  B: '#6080FF',
  W: '#FFFFFF',
  H: '#FFD700',
  T: '#40E0D0',
  P: '#C060FF',
  L: '#80FFFF',
  '!': null, // reset
}

/** §Y … §! color codes */
function colorSegments(text: string): ColorSegment[] {
  const segments: ColorSegment[] = []
  const parts = text.split(/§(.)/)
  let currentColor: string | null = null

  // parts alternates: [text, code, text, code, ...]
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) segments.push({ text: parts[i], color: currentColor })
    } else if (parts[i] in COLOR_MAP) {
      currentColor = COLOR_MAP[parts[i]]
    }
  }
  return segments
}

const DEFAULT_PROMPT = `Ты — опытный литературный переводчик и локализатор игр. Переводи текст локализации Stellaris с английского на русский язык.

Стиль:
- Звучит как оригинальный русский текст, а не как калька. Избегай канцелярита и дословности.
- Описания ивентов (ключи с .desc / _desc) — это маленькие истории: пиши образно и атмосферно, с живыми эпитетами, ритмом и настроением научной фантастики; передавай тон сцены (тревога, величие, ирония, ужас, надежда). Не обрезай и не выдумывай факты, но разрешено перестраивать фразы ради выразительности.
- Названия ивентов (.name) — ёмкие и запоминающиеся.
- Кнопки выбора (.a / .b / .c и подобные) — коротко и по делу, в духе решения персонажа.
- Тултипы, описания эффектов и модификаторов — точно и буквально, без художественных вольностей: игроку важна механика.
- Выдерживай единый стиль и терминологию по всему файлу.

Строгие правила:
- Выдавай ТОЛЬКО переведённые строки в формате Stellaris YML, начиная с "l_russian:"
- Сохраняй ключи и индексы без изменений (например, KEY_NAME:0)
- Сохраняй все цветовые коды как есть: §Y §! §R §B §G §W §H §C и другие
- Сохраняй \\n внутри строк
- Сохраняй переменные и иконки: [This.GetName], $VAR$, %SEQ%, £icon£, @icon@ и другие
- Никаких комментариев, объяснений, markdown или лишнего текста`

const LEGACY_PROMPT = `Ты — эксперт по локализации игр. Переводи текст локализации Stellaris с английского на русский язык.

Строгие правила:
- Выдавай ТОЛЬКО переведённые строки в формате Stellaris YML, начиная с "l_russian:"
- Сохраняй ключи и индексы без изменений (например, KEY_NAME:0)
- Сохраняй все цветовые коды как есть: §Y §! §R §B §G §W §H §C и другие
- Сохраняй \\n внутри строк
- Сохраняй переменные и иконки: [This.GetName], $VAR$, %SEQ%, £icon£, @icon@ и другие
- Никаких комментариев, объяснений, markdown или лишнего текста`

export const stellarisProfile: GameProfile = {
  id: 'stellaris',
  name: 'Stellaris',
  locFolder: 'localisation',

  parse: parseLoc,
  serialize: serializeLoc,
  exportPath: getExportPath,

  // $VAR$, §Y / §!, [Root.GetName], £icon£, @icon@, %SEQ%, literal \n
  tokenRegex: /\$[^$\s"]*\$|§.|\[[^\]\n"]*\]|£[^£\s"]*£|@\w+@?|%\w+%|\\n/g,
  tokenHint: '$...$, §X, [...], £...£, @...@, %...%, \\n',

  colorSegments,
  stripFormatting: (text) => text.replace(/§./g, ''),

  defaultPrompt: DEFAULT_PROMPT,
  legacyPrompts: [LEGACY_PROMPT],
}
