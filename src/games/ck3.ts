import { parseLoc } from '@/parser/locParser'
import { serializeLoc, getExportPath } from '@/parser/locSerializer'
import type { ColorSegment } from '@/parser/colorCodes'
import type { GameProfile } from './types'

interface Style {
  color?: string
  bold?: boolean
}

/** Common CK3 text formats. Unknown formats are stripped but left unstyled. */
const FORMATS: Record<string, Style> = {
  bold: { bold: true },
  b: { bold: true },
  P: { color: '#6FBF5A' }, // positive
  N: { color: '#D0584E' }, // negative
  high: { color: '#E8C46A' },
  warning: { color: '#E8934A' },
  weak: { color: '#9CA3AF' },
  low: { color: '#9CA3AF' },
  I: { color: '#C9B28A' },
  T: { color: '#7FB6C9' },
  Z: { color: '#B07FD6' },
}

const FORMAT_TOKEN = /(#!|#[A-Za-z_][\w;,.]*[ ]?)/

/** #bold … #! formatting; a format code owns the single space after it. */
function colorSegments(text: string): ColorSegment[] {
  const segments: ColorSegment[] = []
  const stack: Style[] = []

  for (const part of text.split(FORMAT_TOKEN)) {
    if (part === '') continue
    if (part === '#!') {
      stack.pop()
    } else if (part.startsWith('#') && part.length > 1) {
      const style: Style = {}
      for (const code of part.slice(1).trim().split(';')) Object.assign(style, FORMATS[code])
      stack.push(style)
    } else {
      const top = stack[stack.length - 1]
      segments.push({ text: part, color: top?.color ?? null, bold: top?.bold })
    }
  }
  return segments
}

const DEFAULT_PROMPT = `Ты — опытный литературный переводчик и локализатор игр. Переводи текст локализации Crusader Kings III с английского на русский язык.

Стиль:
- Звучит как оригинальный русский текст, а не как калька. Избегай канцелярита и дословности.
- Эпоха — раннее и высокое Средневековье: династии, интриги, вера, честь, власть. Тон эпический, драматичный, иногда с иронией; обращения и титулы — в средневековом духе («ваша светлость», «милорд»), без современных оборотов.
- Описания событий (ключи с .desc) — маленькие истории: пиши образно и атмосферно, передавай настроение сцены (интрига, страх, торжество, горечь). Не выдумывай факты, но фразы можно перестраивать ради выразительности.
- Заголовки событий (.t) — ёмкие и запоминающиеся.
- Варианты выбора (.a / .b / .c и подобные) — коротко, в духе решения персонажа.
- Тултипы (.tt), описания эффектов, черт, указов и модификаторов — точно и буквально: игроку важна механика.
- Выдерживай единый стиль и терминологию по всему файлу (титулы, черты, должности).

Имена и склонения:
- Подстановки в квадратных скобках ([...]) нельзя склонять: имя придёт в именительном падеже. Строй фразу так, чтобы подставляемое имя или титул стояло в именительном падеже, не меняя смысла (например, «Его зовут [Имя]», а не «Подарок для [Имя]»).
- Функции рода и числа ([...GetHerHis], [...GetHeShe] и подобные) оставляй без изменений и учитывай, что слова вокруг них должны подходить обоим родам.

Строгие правила:
- Выдавай ТОЛЬКО переведённые строки в формате YML, начиная с "l_russian:"
- Сохраняй ключи, индексы и формат строки без изменений (KEY: "текст" или KEY:0 "текст")
- Сохраняй форматирование текста: #bold … #!, #P, #N, #high и любые другие коды #… и закрывающий #!
- Сохраняй переменные и функции целиком: [ROOT.Char.GetName], [GetTrait('brave').GetName], $VAR$, $VALUE|=+0$, иконки @icon!
- Сохраняй \\n внутри строк
- Никаких комментариев, объяснений, markdown или лишнего текста`

export const ck3Profile: GameProfile = {
  id: 'ck3',
  name: 'Crusader Kings III',
  locFolder: 'localization',

  parse: parseLoc,
  serialize: serializeLoc,
  exportPath: getExportPath,

  // $VAR$ / $VALUE|=+0$, #bold / #! formats, [scope.Function] (for calls with quoted
  // arguments only the opening `[Func(` is pinned — the quoted text may need translating),
  // @icon!, literal \n
  tokenRegex: /\$[^$\s"]*\$|#!|#[A-Za-z_][\w;,.]*|\[[^\]\n'"]*\]|\[[\w.]+\(|@\w+!?|\\n/g,
  tokenHint: '$...$, #формат и #!, [...], @иконка!, \\n',

  colorSegments,
  stripFormatting: (text) => text.replace(/#!|#[A-Za-z_][\w;,.]*[ ]?/g, ''),

  defaultPrompt: DEFAULT_PROMPT,
  legacyPrompts: [],
}
