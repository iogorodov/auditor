import { Descriptor } from './descriptor'
import type { XmlMeta } from './xml'

const CONTENT_TYPES_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/content-types'
const RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships'
const RELATIONSHIPS_NAMESPACE2 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const MAIN_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

export const enum ContentType {
  XML = 'application/xml',
  RELATIONSHIPS = 'application/vnd.openxmlformats-package.relationships+xml',
  WORKBOOK = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
  STYLE_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml',
}

export type DefaultType = {
  contentType: ContentType
  extension: string
}

const DEFAULT_TYPE_SCHEMA = Descriptor.create<DefaultType, XmlMeta>({})
  .string('contentType', { attribute: true, name: 'ContentType' })
  .string('extension', { attribute: true, name: 'Extension' })
  .get()

export type OverrideType = {
  contentType: ContentType
  partName: string
}

const OVERRIDE_TYPE_SCHEMA = Descriptor.create<OverrideType, XmlMeta>({})
  .string('contentType', { attribute: true, name: 'ContentType' })
  .string('partName', { attribute: true, name: 'PartName' })
  .get()

export type ContentTypes = {
  defaults: DefaultType[]
  overrides: OverrideType[]
}

export const CONTENT_TYPES_SCHEMA = Descriptor.create<ContentTypes, XmlMeta>({})
  .meta({
    standalone: 'yes',
    name: 'Types',
    namespace: CONTENT_TYPES_NAMESPACE,
  })
  .objectArray('defaults', DEFAULT_TYPE_SCHEMA, { value: true, localName: 'Default' })
  .objectArray('overrides', OVERRIDE_TYPE_SCHEMA, { value: true, localName: 'Override' })
  .get()

export const enum RelationshipType {
  WORKBOOK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  SHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  STYLE_SHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  HYPERLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
}

export type RelId = {
  id: number
}

function formatRelId(v: RelId): string {
  return `rId${v.id}`
}

export type Relationship = {
  id: RelId
  target: string
  targetMode: 'External' | null
  type: RelationshipType
}

const RELATIONSHIP_SCHEMA = Descriptor.create<Relationship, XmlMeta>({})
  .stringCallback('id', formatRelId, { attribute: true, name: 'Id' })
  .string('target', { attribute: true, name: 'Target' })
  .stringNull('targetMode', { attribute: true, name: 'TargetMode' })
  .string('type', { attribute: true, name: 'Type' })
  .get()

export type Relationships = {
  relationships: Relationship[]
}

export const RELATIONSHIPS_SCHEMA = Descriptor.create<Relationships, XmlMeta>({})
  .meta({
    standalone: 'yes',
    name: 'Relationships',
    namespace: RELATIONSHIPS_NAMESPACE,
  })
  .objectArray('relationships', RELATIONSHIP_SCHEMA, { value: true, localName: 'Relationship' })
  .get()

export type Ref = {
  row: number
  col: number
}

function formatCol(col: number): string {
  let result = ''
  let num = col

  while (num > 0) {
    num-- // Convert to 0-based
    result = String.fromCharCode(65 + (num % 26)) + result
    num = Math.floor(num / 26)
  }

  return result
}

export function formatRef(v: Ref): string {
  return formatCol(v.col) + v.row.toString()
}

export type Range = {
  from: Ref
  to: Ref
}

function formatRange(v: Range): string {
  if (v.from.row === v.to.row && v.from.col === v.to.col) return formatRef(v.from)
  return `${formatRef(v.from)}:${formatRef(v.to)}`
}

export type Dimension = {
  ref: Range
}

export type Column = {
  customWidth: number
  max: number
  min: number
  width: number
}

export type Cell = {
  r: Ref
  s: number
  t: 'str' | null
  v: string
}

export type Row = {
  r: number
  c: Cell[]
}

export type Hyperlink = {
  id: RelId
  ref: Ref
}

export type Pane = {
  activePane: 'bottomLeft'
  state: 'frozen'
  topLeftCell: Ref
  ySplit: number
}

export type SheetView = {
  showGridLines: 1
  tabSelected: 0
  workbookViewId: 0
  pane: Pane
}

export type Worksheet = {
  dimension: Dimension
  sheetViews: SheetView[] | null
  cols: Column[] | null
  sheetData: Row[]
  hyperlinks: Hyperlink[] | null
}

const DIMENSION_SCHEMA = Descriptor.create<Dimension, XmlMeta>({}).stringCallback('ref', formatRange, { attribute: true }).get()

const PANE_SCHEMA = Descriptor.create<Pane, XmlMeta>({})
  .string('activePane', { attribute: true })
  .string('state', { attribute: true })
  .stringCallback('topLeftCell', formatRef, { attribute: true })
  .number('ySplit', { attribute: true, float: true })
  .get()

const SHEET_VIEW_SCHEMA = Descriptor.create<SheetView, XmlMeta>({})
  .number('showGridLines', { attribute: true })
  .number('tabSelected', { attribute: true })
  .number('workbookViewId', { attribute: true })
  .object('pane', PANE_SCHEMA)
  .get()

const COLUMN_SCHEMA = Descriptor.create<Column, XmlMeta>({})
  .number('customWidth', { attribute: true })
  .number('max', { attribute: true })
  .number('min', { attribute: true })
  .number('width', { attribute: true, float: true })
  .get()

const CELL_SCHEMA = Descriptor.create<Cell, XmlMeta>({})
  .stringCallback('r', formatRef, { attribute: true })
  .number('s', { attribute: true })
  .stringNull('t', { attribute: true })
  .string('v')
  .get()

const ROW_SCHEMA = Descriptor.create<Row, XmlMeta>({})
  .number('r', { attribute: true })
  .objectArray('c', CELL_SCHEMA, { value: true })
  .get()

const HYPERLINK_SCHEMA = Descriptor.create<Hyperlink, XmlMeta>({})
  .stringCallback('id', formatRelId, { attribute: true, namespace: RELATIONSHIPS_NAMESPACE2 })
  .stringCallback('ref', formatRef, { attribute: true })
  .get()

export const WORKSHEET_SCHEMA = Descriptor.create<Worksheet, XmlMeta>({})
  .meta({
    standalone: 'yes',
    name: 'worksheet',
    namespace: MAIN_NAMESPACE,
    namespaces: [
      {
        prefix: 'r',
        uri: RELATIONSHIPS_NAMESPACE2,
      },
    ],
  })
  .object('dimension', DIMENSION_SCHEMA)
  .objectArrayNull('sheetViews', SHEET_VIEW_SCHEMA, { localName: 'sheetView' })
  .objectArrayNull('cols', COLUMN_SCHEMA, { localName: 'col' })
  .objectArray('sheetData', ROW_SCHEMA, { localName: 'row' })
  .objectArrayNull('hyperlinks', HYPERLINK_SCHEMA, { localName: 'hyperlink' })
  .get()

export type WorkbookPr = {
  date1904: false
}

export type WorkbookSheet = {
  name: string
  id: RelId
  sheetId: number
}

export type Workbook = {
  workbookPr: WorkbookPr
  sheets: WorkbookSheet[]
}

const WORKBOOK_PR_SCHEMA = Descriptor.create<WorkbookPr, XmlMeta>({}).boolean('date1904', { attribute: true }).get()

const WORKBOOK_SHEET_SCHEMA = Descriptor.create<WorkbookSheet, XmlMeta>({})
  .string('name', { attribute: true })
  .stringCallback('id', formatRelId, { attribute: true, namespace: RELATIONSHIPS_NAMESPACE2 })
  .number('sheetId', { attribute: true })
  .get()

export const WORKBOOK_SCHEMA = Descriptor.create<Workbook, XmlMeta>({})
  .meta({
    standalone: 'yes',
    name: 'workbook',
    namespace: MAIN_NAMESPACE,
    namespaces: [
      {
        prefix: 'r',
        uri: RELATIONSHIPS_NAMESPACE2,
      },
    ],
  })
  .object('workbookPr', WORKBOOK_PR_SCHEMA)
  .objectArray('sheets', WORKBOOK_SHEET_SCHEMA, { localName: 'sheet' })
  .get()
