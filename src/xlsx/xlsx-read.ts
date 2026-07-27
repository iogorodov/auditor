// Чтение xlsx: unzip (fflate) -> мини-парсер XML -> типизированные схемы чтения ->
// листы как string[][]. Терпимо к файлам Excel и Google Sheets: пути частей берутся из
// rels, строки — из sharedStrings / inlineStr / v, галочки (t="b") -> 'TRUE'/'FALSE',
// разреженные строки и пропуски ячеек заполняются ''.

import { unzipSync } from 'fflate'
import { read } from './serialize'
import type { Descriptor } from './descriptor'
import type { XmlMeta } from './xml'
import type { DeepSimpleObject } from './type-utils'
import { parseXml, type XmlElement } from './xml-parse'
import { XmlReader } from './xml-reader'
import {
  type CellRead,
  RELATIONSHIPS_READ_SCHEMA,
  type RelationshipsRead,
  type RowRead,
  SHARED_STRINGS_READ_SCHEMA,
  type SharedStringsRead,
  sharedStringText,
  WORKBOOK_READ_SCHEMA,
  type WorkbookRead,
  WORKSHEET_READ_SCHEMA,
  type WorksheetRead,
} from './xlsx-read-types'

export type SheetRows = {
  name: string
  rows: string[][] // включая строку заголовка; пустые ячейки — ''
}

export class XlsxReadError extends Error {}

const SHEET_REL_TYPE_SUFFIX = '/worksheet'
const SHARED_STRINGS_REL_TYPE_SUFFIX = '/sharedStrings'

type Files = { [path: string]: Uint8Array }

function unzip(data: Uint8Array): Files {
  try {
    return unzipSync(data)
  } catch {
    throw new XlsxReadError('Файл не является xlsx (не распаковывается)')
  }
}

function parsePart(files: Files, path: string): XmlElement {
  const bytes = files[path]
  if (!bytes) throw new XlsxReadError(`В файле нет части «${path}»`)
  try {
    return parseXml(new TextDecoder().decode(bytes))
  } catch (e) {
    throw new XlsxReadError(`Не разобрана часть «${path}»: ${e instanceof Error ? e.message : e}`)
  }
}

function readPart<T extends DeepSimpleObject>(files: Files, path: string, defaults: T, schema: Descriptor<T, XmlMeta>): T {
  return read(defaults, schema, new XmlReader(parsePart(files, path)))
}

// Путь из rels: относительный — от xl/, абсолютный — от корня пакета.
function resolveTarget(target: string): string {
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`
}

// "C5" -> колонка 3 (1-based); строка нам даётся атрибутом row/@r.
function colFromRef(ref: string): number | null {
  let col = 0
  let i = 0
  while (i < ref.length) {
    const code = ref.charCodeAt(i)
    if (code >= 65 && code <= 90) col = col * 26 + (code - 64)
    else if (code >= 97 && code <= 122) col = col * 26 + (code - 96)
    else break
    i++
  }
  return i > 0 && col > 0 ? col : null
}

function cellText(cell: CellRead, shared: string[]): string {
  switch (cell.t) {
    case 's': {
      const index = Number(cell.v)
      return (Number.isInteger(index) && shared[index]) || ''
    }
    case 'inlineStr':
      if (!cell.is) return ''
      return cell.is.t !== null ? cell.is.t : cell.is.runs.map(run => run.t ?? '').join('')
    case 'b':
      return cell.v === '1' ? 'TRUE' : 'FALSE'
    case 'e':
      return ''
    default:
      // 'str', 'n' и ячейки без t: берём v как есть (числа остаются строками).
      return cell.v ?? ''
  }
}

// Строки листа: позиция строки — из row/@r, колонки — из c/@r; пропуски заполняются ''.
function buildRows(sheetData: RowRead[], shared: string[]): string[][] {
  const rows: string[][] = []
  let lastRow = 0
  for (const row of sheetData) {
    const rowIndex = row.r ?? lastRow + 1
    lastRow = rowIndex
    while (rows.length < rowIndex) rows.push([])
    const target = rows[rowIndex - 1]!
    let lastCol = 0
    for (const cell of row.c) {
      const col = (cell.r !== null ? colFromRef(cell.r) : null) ?? lastCol + 1
      lastCol = col
      while (target.length < col) target.push('')
      target[col - 1] = cellText(cell, shared)
    }
  }
  return rows
}

export function readXlsxSheets(data: Uint8Array): SheetRows[] {
  const files = unzip(data)

  const workbook = readPart<WorkbookRead>(files, 'xl/workbook.xml', { sheets: [] }, WORKBOOK_READ_SCHEMA)
  if (!workbook.sheets.length) throw new XlsxReadError('В книге не найдены листы (xl/workbook.xml)')

  const rels = readPart<RelationshipsRead>(files, 'xl/_rels/workbook.xml.rels', { relationships: [] }, RELATIONSHIPS_READ_SCHEMA)
  const relById = new Map(rels.relationships.map(rel => [rel.id, rel]))

  const sharedRel = rels.relationships.find(rel => rel.type.endsWith(SHARED_STRINGS_REL_TYPE_SUFFIX))
  const sharedPath = sharedRel ? resolveTarget(sharedRel.target) : 'xl/sharedStrings.xml'
  const shared = files[sharedPath]
    ? readPart<SharedStringsRead>(files, sharedPath, { items: [] }, SHARED_STRINGS_READ_SCHEMA).items.map(sharedStringText)
    : []

  return workbook.sheets.map(sheet => {
    const rel = relById.get(sheet.id)
    if (!rel || !rel.type.endsWith(SHEET_REL_TYPE_SUFFIX)) {
      throw new XlsxReadError(`Не найден путь листа «${sheet.name}» (${sheet.id})`)
    }
    const worksheet = readPart<WorksheetRead>(files, resolveTarget(rel.target), { sheetData: [] }, WORKSHEET_READ_SCHEMA)
    return { name: sheet.name, rows: buildRows(worksheet.sheetData, shared) }
  })
}
