# Stellaris Translator

Десктопный инструмент для перевода модов Stellaris. Загружай `.yml`-файлы локализации, переводи записи вручную или через Gemini AI, отслеживай прогресс и экспортируй готовые файлы.

---

## Возможности

- **Импорт `.yml` / `.yaml`** — поддержка стандартного формата локализации Stellaris (`l_english:`, индексы `:0`)
- **Редактор записей** — список с фильтрацией по статусу, поиск, горячие клавиши
- **Автоперевод через Gemini AI**
  - Платный API (любая модель, потоковый режим)
  - Бесплатный API (`gemini-2.5-flash`) с пулом ключей и авто-ротацией при 429
- **Глоссарий** — термины, которые автоматически подсвечиваются в тексте
- **Экспорт** — восстановление оригинальной структуры файла с переведёнными строками
- **Прогресс по файлам** — статистика translated / approved / missing

---

## Стек

| Слой | Технология |
|---|---|
| UI | React 19 + Vite |
| Стилизация | Tailwind CSS + Radix UI |
| База данных | Dexie 4 (IndexedDB) |
| AI | Google Gemini (`@google/genai`) |
| Язык | TypeScript 5.7 |

---

## Установка и запуск

```bash
npm install
npm run dev
```

Открыть `http://localhost:5173`.

Сборка для production:

```bash
npm run build
```

---

## Структура проекта

```
src/
├── components/
│   ├── dashboard/          # Статистика прогресса
│   ├── editor/             # Редактор: панели оригинала, перевода, AI-кнопки
│   ├── filetree/           # Дерево файлов проекта
│   ├── glossary/           # Глоссарий и подсветка
│   ├── layout/             # AppShell, Sidebar
│   ├── project/            # Диалоги проекта (импорт, настройки)
│   └── shared/             # Переиспользуемые компоненты
├── db/
│   ├── schema.ts           # Схема Dexie (projects, translationFiles, glossaryEntries, meta)
│   └── operations.ts       # CRUD-операции и хранение настроек
├── hooks/
│   ├── useImport.ts        # Парсинг и импорт файлов
│   ├── useExport.ts        # Сборка и экспорт
│   └── useSearch.ts        # Глобальный поиск по записям
├── parser/
│   ├── stellarisParser.ts  # Парсинг .yml → TranslationEntry[]
│   ├── stellarisSerializer.ts  # TranslationEntry[] → .yml
│   └── colorCodes.ts       # Обработка цветовых кодов §Y §R §! и т.д.
├── providers/
│   ├── GeminiRateLimiter.ts  # Реактивная обработка 429: handle429() → RateLimitDecision
│   └── ApiKeyPool.ts         # Пул ключей с ротацией и отслеживанием RPD-исчерпания
├── services/
│   ├── geminiService.ts    # Платный API: потоковый перевод, retry, GeminiError
│   └── freeGeminiService.ts  # Бесплатный API: ротация ключей, реактивный rate limit
├── store/
│   ├── EditorContext.tsx   # Активный файл, активная запись, dirty-флаг
│   ├── ProjectContext.tsx  # Список проектов, активный проект
│   └── GlossaryContext.tsx # Записи глоссария
├── types/
│   └── index.ts            # TranslationEntry, TranslationFile, Project, GlossaryEntry
└── utils/
    ├── fileHelpers.ts
    ├── idHelpers.ts
    └── progressCalc.ts
```

---

## Настройка AI

### Платный API (Google AI Studio)

1. Получить ключ на [aistudio.google.com](https://aistudio.google.com) → **Get API key**
2. Открыть настройки (иконка ⚙ в редакторе)
3. Вставить ключ и выбрать модель (например `gemini-2.5-flash-preview-04-17`)
4. Нажать **Auto** для запуска перевода

Модель поддерживает потоковый режим — переведённые строки появляются по мере генерации.

### Бесплатный API (Free Tier)

1. Получить ключ там же — бесплатный tier входит в тот же аккаунт
2. В настройках → секция **Free Gemini API** → добавить один или несколько ключей
3. Нажать **Free Auto** для запуска

**Лимиты free tier:** 15 req/min, 200 req/day на ключ.

#### Пул ключей и авто-ротация

Можно добавить несколько ключей (от разных Google-аккаунтов). При получении ответа `429`:

| Тип лимита | Признак | Действие |
|---|---|---|
| RPM (временный) | `retryDelay` ≤ 120 сек в теле ответа | Переключиться на следующий ключ немедленно. Если все ключи исчерпаны по RPM — ждать `retryDelay + 2с`, затем повторить |
| RPD (дневной) | нет `retryDelay` или > 120 сек | Ключ помечается исчерпанным на сессию, переключение на следующий. Если ключей не осталось — возврат частичного результата |

После 3 безуспешных раундов по всем ключам подряд — выброс `UnexpectedRateLimitError`.

---

## Горячие клавиши

| Комбинация | Действие |
|---|---|
| `Ctrl+Enter` | Отметить как переведено и перейти к следующей |
| `Ctrl+Shift+Enter` | Одобрить и перейти к следующей |
| `Ctrl+]` | Следующая запись |
| `Ctrl+[` | Предыдущая запись |
| `Ctrl+K` | Глобальный поиск |
| `Ctrl+G` | Открыть/закрыть глоссарий |

---

## Статусы записей

| Статус | Цвет | Описание |
|---|---|---|
| `missing` | красный | Перевод отсутствует |
| `outdated` | жёлтый | Оригинал изменился после перевода |
| `translated` | зелёный | Переведено (вручную или AI) |
| `approved` | синий | Проверено и одобрено |

---

## Архитектура AI-слоя

```
TranslationPanel
    │
    ├── autoTranslateFile()          ← geminiService.ts (paid, streaming)
    │       └── translateWithRetry() ← retry 3×7×15s на сетевые ошибки
    │
    └── autoTranslateFree()          ← freeGeminiService.ts
            ├── ApiKeyPool           ← ротация ключей при 429
            ├── GeminiRateLimiter    ← handle429() → retry | abort
            └── callWithNetworkRetry ← backoff 1s/2s/4s на сетевые ошибки
```

### GeminiError

Все ошибки от SDK оборачиваются в `GeminiError` с полями:
- `code` — HTTP-статус (429, 403, 500…)
- `status` — строка от API (`RESOURCE_EXHAUSTED`, `PERMISSION_DENIED`…)
- `details` — массив деталей из тела ответа (используется для парсинга `retryDelay`)
- `userMessage` — человекочитаемое сообщение на русском

---

## База данных

Используется **Dexie** (обёртка над IndexedDB). Данные хранятся локально в браузере.

| Таблица | Ключ | Содержимое |
|---|---|---|
| `projects` | `id` | Название, даты создания/обновления |
| `translationFiles` | `id` | Записи перевода, статусы, путь к файлу |
| `glossaryEntries` | `id` | Пары исходный термин → перевод |
| `meta` | `key` | Настройки Gemini, системный промпт, последний проект |

Настройки Gemini хранятся в `meta['geminiSettings']` как JSON:
```ts
{
  apiKey: string        // платный ключ
  model: string         // модель для платного API
  freeApiKeys: string[] // массив ключей для free tier
}
```

---

## Разработка

```bash
npm run dev      # dev-сервер с HMR
npm run build    # production-сборка
npm run lint     # ESLint
npm run preview  # предпросмотр production-сборки
```

---

## Лицензия

MIT
