import { zip } from 'fflate'
import { write } from './serialize'
import type { Descriptor } from './descriptor'
import { type XmlMeta, XmlWriter } from './xml'
import type { DeepSimpleObject } from './type-utils'
import { promisify } from './utils'
import { StylesCollector } from './styles-collector'
import { buildFileGlobal, buildWorksheet } from './xlsx-build'
import { STYLE_SHEET_SCHEMA } from './xlsx-style-types'
import { CONTENT_TYPES_SCHEMA, RELATIONSHIPS_SCHEMA, WORKBOOK_SCHEMA, WORKSHEET_SCHEMA } from './xlsx-types'

export const enum CellType {
  NUMBER = 'n',
  WORK_TIME = 't',
  FULL_DAY_TIME = 'f',
  INTEGER = 'N',
  SHORT_STRING = 's',
  LONG_STRING = 'S',
  TEXT = 'T',
  PERCENT = 'p',
  DATE = 'd',
  DATE_TIME = 'D',
}

export type ColumnType = {
  type: CellType
  resolved?: false
}

export type Cell = {
  // Переопределение типа колонки для конкретной ячейки (например, текст в числовой колонке)
  type?: CellType
  indent?: number
  value: string
  href?: string
}

export type Row = (Cell | null)[]

export type Worksheet = {
  name: string
  columns: ColumnType[]
  headers: Row[]
  data: Row[]
  freeze?: { col: number; row: number }
}

type Files = { [path: string]: Uint8Array }

function addObject<T extends DeepSimpleObject>(
  files: Files,
  filepath: string,
  data: T,
  desc: Descriptor<T, XmlMeta>,
): Promise<void> {
  files[filepath] = write(data, desc, new XmlWriter({ pretty: false })).bytes()
  return Promise.resolve()
}

export async function buildXlsxFile(sheets: Worksheet[]): Promise<Uint8Array> {
  const files: Files = {}
  const fileGlobal = buildFileGlobal(sheets.map(w => ({ name: w.name })))
  await addObject(files, '[Content_Types].xml', fileGlobal.contentTypes, CONTENT_TYPES_SCHEMA)
  await addObject(files, '_rels/.rels', fileGlobal.globalRels, RELATIONSHIPS_SCHEMA)
  await addObject(files, 'xl/workbook.xml', fileGlobal.workbook, WORKBOOK_SCHEMA)
  await addObject(files, 'xl/_rels/workbook.xml.rels', fileGlobal.workbookRels, RELATIONSHIPS_SCHEMA)
  const styles = new StylesCollector()
  for (const [index, sheet] of sheets.entries()) {
    const s = buildWorksheet(sheet, styles)
    await addObject(files, `xl/sheet${index + 1}.xml`, s.data, WORKSHEET_SCHEMA)
    if (s.rels) {
      await addObject(files, `xl/_rels/sheet${index + 1}.xml.rels`, s.rels, RELATIONSHIPS_SCHEMA)
    }
  }
  await addObject(files, 'xl/styles.xml', styles.getStyleSheet(), STYLE_SHEET_SCHEMA)
  return promisify(f => zip(files, f))
}
