// Схемы для ЧТЕНИЯ частей xlsx. Отдельные от схем записи (xlsx-types): чужие файлы
// (Excel, Google Sheets) содержат надмножество наших структур — sharedStrings (t="s"),
// rich-text runs (<r><t>), inlineStr (<is><t>), формулы (<f>, игнорируем), разреженные
// строки. Здесь описано только то, что нужно достать; лишнее XmlReader игнорирует.

import { Descriptor } from './descriptor'
import type { XmlMeta } from './xml'

// xl/workbook.xml: имена листов + r:id для поиска пути через rels.
export type SheetRefRead = {
  name: string
  id: string // атрибут r:id ("rId5")
}

const SHEET_REF_READ_SCHEMA = Descriptor.create<SheetRefRead, XmlMeta>({})
  .string('name', { attribute: true })
  .string('id', { attribute: true })
  .get()

export type WorkbookRead = {
  sheets: SheetRefRead[]
}

export const WORKBOOK_READ_SCHEMA = Descriptor.create<WorkbookRead, XmlMeta>({})
  .meta({ name: 'workbook' })
  .objectArray('sheets', SHEET_REF_READ_SCHEMA, { localName: 'sheet' })
  .get()

// _rels/*.rels: r:id -> путь части.
export type RelationshipRead = {
  id: string
  target: string
  type: string
}

const RELATIONSHIP_READ_SCHEMA = Descriptor.create<RelationshipRead, XmlMeta>({})
  .string('id', { attribute: true, name: 'Id' })
  .string('target', { attribute: true, name: 'Target' })
  .string('type', { attribute: true, name: 'Type' })
  .get()

export type RelationshipsRead = {
  relationships: RelationshipRead[]
}

export const RELATIONSHIPS_READ_SCHEMA = Descriptor.create<RelationshipsRead, XmlMeta>({})
  .meta({ name: 'Relationships' })
  .objectArray('relationships', RELATIONSHIP_READ_SCHEMA, { value: true, localName: 'Relationship' })
  .get()

// Кусок текста: <t> внутри <si>, <is> или rich-text run <r>.
export type RichRunRead = {
  t: string | null
}

const RICH_RUN_READ_SCHEMA = Descriptor.create<RichRunRead, XmlMeta>({}).stringNull('t').get()

// xl/sharedStrings.xml: <si> — либо простой <t>, либо rich-text runs <r><t>.
export type SharedStringRead = {
  t: string | null
  runs: RichRunRead[]
}

const SHARED_STRING_READ_SCHEMA = Descriptor.create<SharedStringRead, XmlMeta>({})
  .stringNull('t')
  .objectArray('runs', RICH_RUN_READ_SCHEMA, { value: true, localName: 'r' })
  .get()

export type SharedStringsRead = {
  items: SharedStringRead[]
}

export const SHARED_STRINGS_READ_SCHEMA = Descriptor.create<SharedStringsRead, XmlMeta>({})
  .meta({ name: 'sst' })
  .objectArray('items', SHARED_STRING_READ_SCHEMA, { value: true, localName: 'si' })
  .get()

// Текст одного куска: простой <t> приоритетнее (Excel не смешивает t и runs).
export function sharedStringText(si: SharedStringRead): string {
  if (si.t !== null) return si.t
  return si.runs.map(run => run.t ?? '').join('')
}

// xl/worksheets/sheetN.xml: только sheetData. Ячейка: r — ссылка ("C5"), t — тип
// ('s' | 'b' | 'str' | 'inlineStr' | ... | нет), v — значение, is — inline-строка.
export type InlineStrRead = {
  t: string | null
  runs: RichRunRead[]
}

const INLINE_STR_READ_SCHEMA = Descriptor.create<InlineStrRead, XmlMeta>({})
  .stringNull('t')
  .objectArray('runs', RICH_RUN_READ_SCHEMA, { value: true, localName: 'r' })
  .get()

export type CellRead = {
  r: string | null
  t: string | null
  v: string | null
  is: InlineStrRead | null
}

const CELL_READ_SCHEMA = Descriptor.create<CellRead, XmlMeta>({})
  .stringNull('r', { attribute: true })
  .stringNull('t', { attribute: true })
  .stringNull('v')
  .objectNull('is', INLINE_STR_READ_SCHEMA)
  .get()

export type RowRead = {
  r: number | null
  c: CellRead[]
}

const ROW_READ_SCHEMA = Descriptor.create<RowRead, XmlMeta>({})
  .numberNull('r', { attribute: true })
  .objectArray('c', CELL_READ_SCHEMA, { value: true })
  .get()

export type WorksheetRead = {
  sheetData: RowRead[]
}

export const WORKSHEET_READ_SCHEMA = Descriptor.create<WorksheetRead, XmlMeta>({})
  .meta({ name: 'worksheet' })
  .objectArray('sheetData', ROW_READ_SCHEMA, { localName: 'row' })
  .get()
