import { HyperlinkCollector } from './hyperlink-collector'
import { CellType, type ColumnType, type Cell as SrcCell, type Row as SrcRow, type Worksheet as SrcWorksheet } from './xlsx'
import type { Style, StylesCollector } from './styles-collector'
import {
  type Cell,
  type Column,
  ContentType,
  type ContentTypes,
  type DefaultType,
  type Dimension,
  type OverrideType,
  type Relationships,
  RelationshipType,
  type Row,
  type SheetView,
  type Workbook,
  type Worksheet,
} from './xlsx-types'

type XlsxGlobals = {
  contentTypes: ContentTypes
  globalRels: Relationships
  workbook: Workbook
  workbookRels: Relationships
}

function buildContentTypes(sheets: unknown[]): ContentTypes {
  const defaults: DefaultType[] = [
    {
      contentType: ContentType.XML,
      extension: 'xml',
    },
    {
      contentType: ContentType.RELATIONSHIPS,
      extension: 'rels',
    },
  ]

  const overrides: OverrideType[] = [
    {
      contentType: ContentType.WORKBOOK,
      partName: '/xl/workbook.xml',
    },
    {
      contentType: ContentType.STYLE_SHEET,
      partName: '/xl/styles.xml',
    },
  ].concat(sheets.map((_, i) => ({ contentType: ContentType.SHEET, partName: `/xl/sheet${i + 1}.xml` })))

  return { defaults, overrides }
}

function getGlobalRels(): Relationships {
  return {
    relationships: [
      {
        id: { id: 1 },
        target: 'xl/workbook.xml',
        targetMode: null,
        type: RelationshipType.WORKBOOK,
      },
    ],
  }
}

function buildWorkbook(sheets: { name: string }[]): Workbook {
  return {
    workbookPr: { date1904: false },
    sheets: sheets.map((it, index) => ({
      name: it.name,
      id: { id: index + 1 },
      sheetId: index + 1,
    })),
  }
}

function buildWorkbookRels(sheets: unknown[]): Relationships {
  return {
    relationships: sheets
      .map((_, i) => ({
        id: { id: i + 1 },
        target: `sheet${i + 1}.xml`,
        targetMode: null,
        type: RelationshipType.SHEET,
      }))
      .concat([
        {
          id: { id: sheets.length + 1 },
          target: 'styles.xml',
          targetMode: null,
          type: RelationshipType.STYLE_SHEET,
        },
      ]),
  }
}

function buildDimension(totalRows: number, totalCols: number): Dimension {
  return {
    ref: {
      from: { row: 1, col: 1 },
      to: {
        row: Math.max(1, totalRows),
        col: Math.max(1, totalCols),
      },
    },
  }
}

function getStyleWidth(type: CellType): number {
  switch (type) {
    case CellType.SHORT_STRING:
      return 10
    case CellType.LONG_STRING:
      return 16
    case CellType.TEXT:
      return 50
    case CellType.DATE:
      return 11
    case CellType.DATE_TIME:
      return 16
    default:
      return 8
  }
}

function buildCols(src: ColumnType[]): Column[] {
  return src.map((col, i) => ({
    min: 1 + i,
    max: 1 + i,
    width: getStyleWidth(col.type),
    customWidth: 1,
  }))
}

function getFirstRow(headers: SrcRow[], data: SrcRow[]): SrcRow | undefined {
  return headers.length > 0 ? headers[0] : data[0]
}

function getColumns(src: SrcWorksheet): ColumnType[] {
  const firstRow = getFirstRow(src.headers, src.data)
  const firstRowColumns = firstRow?.length || 0
  const totalColumns = Math.max(src.columns.length, firstRowColumns)

  return Array.from({ length: totalColumns }, (_, index) => src.columns[index] || { type: CellType.SHORT_STRING })
}

type FontOptions = {
  header: boolean
  href: boolean
  resolved: boolean
}

function getCellFont(cellOptions: FontOptions): Style['font'] {
  const { header, href, resolved } = cellOptions
  if (!resolved) return 'gray'
  if (header) return 'bold'
  return href ? 'link' : 'normal'
}

function getCellFormat(type: CellType): Style['format'] {
  switch (type) {
    case CellType.NUMBER:
    case CellType.WORK_TIME:
    case CellType.FULL_DAY_TIME:
      return 'float'
    case CellType.INTEGER:
      return 'integer'
    case CellType.PERCENT:
      return 'percent'
    case CellType.DATE:
      return 'date'
    case CellType.DATE_TIME:
      return 'date-time'
    default:
      return 'general'
  }
}

function getCellStyle(type: CellType, indent: number, cellOptions: FontOptions): Style {
  const format = getCellFormat(type)
  return {
    font: getCellFont(cellOptions),
    format,
    indent: indent * 2,
    wrapText: format === 'general',
  }
}

function buildCell(row: number, col: number, header: boolean, data: SrcCell, column: ColumnType, styles: StylesCollector): Cell {
  const type = data.type || (header ? CellType.LONG_STRING : column.type)
  const indent = header ? 0 : data.indent || 0
  const resolved = header || column.resolved !== false
  const style = getCellStyle(type, indent, {
    header,
    href: !!data.href,
    resolved,
  })

  return {
    r: { row, col },
    s: styles.getStyleIndex(style),
    t: style.format === 'general' ? 'str' : null,
    v: data.value,
  }
}

function addRow(
  row: number,
  header: boolean,
  src: SrcRow,
  columns: ColumnType[],
  styles: StylesCollector,
  links: HyperlinkCollector,
  result: Row[],
): void {
  const cells = src.reduce((result, data, i) => {
    if (data) {
      const col = i + 1
      result.push(buildCell(row, col, header, data, columns[i] || { type: CellType.SHORT_STRING }, styles))
      if (data.href) links.add(row, col, data.href)
    }
    return result
  }, [] as Cell[])

  if (cells.length) result.push({ r: row, c: cells })
}

function buildSheetData(
  headers: SrcRow[],
  data: SrcRow[],
  columns: ColumnType[],
  styles: StylesCollector,
  links: HyperlinkCollector,
): Row[] {
  const headersCount = headers.length
  const result: Row[] = []
  headers.forEach((it, i) => {
    addRow(i + 1, true, it, columns, styles, links, result)
  })
  data.forEach((it, i) => {
    addRow(i + headersCount + 1, false, it, columns, styles, links, result)
  })

  return result
}

function buildSheetViews(freeze?: { col: number; row: number }): SheetView[] | null {
  if (!freeze || (freeze.col === 0 && freeze.row === 0)) return null

  return [
    {
      showGridLines: 1,
      tabSelected: 0,
      workbookViewId: 0,
      pane: {
        activePane: 'bottomLeft',
        state: 'frozen',
        topLeftCell: {
          row: freeze.row + 1,
          col: freeze.col + 1,
        },
        ySplit: 1,
      },
    },
  ]
}

export function buildFileGlobal(sheets: { name: string }[]): XlsxGlobals {
  return {
    contentTypes: buildContentTypes(sheets),
    globalRels: getGlobalRels(),
    workbook: buildWorkbook(sheets),
    workbookRels: buildWorkbookRels(sheets),
  }
}

export function buildWorksheet(src: SrcWorksheet, styles: StylesCollector): { data: Worksheet; rels: Relationships | undefined } {
  const links = new HyperlinkCollector()
  const columns = getColumns(src)

  const dimension = buildDimension(src.headers.length + src.data.length, columns.length)
  const sheetViews = buildSheetViews(src.freeze)
  const cols = columns.length ? buildCols(columns) : null
  const sheetData = buildSheetData(src.headers, src.data, columns, styles, links)
  const hyperlinks = links.getHyperlinks()

  const data = { dimension, sheetViews, cols, sheetData, hyperlinks }
  const rels = links.getRelationships()

  return { data, rels }
}
