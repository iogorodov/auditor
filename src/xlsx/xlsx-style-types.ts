import { Descriptor } from './descriptor'
import type { XmlMeta } from './xml'
import type { DeepSimpleObject } from './type-utils'
import { MAIN_NAMESPACE } from './xlsx-types'

const MARKUP_COMPATIBILITY_NAMESPACE = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const X14AC_NAMESPACE = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac'

export type StyleSheetArray<T> = {
  count: number | null
  values: T[]
}

export type NumberFormat = {
  formatCode: string
  numFmtId: number
}

export type NumberValue = {
  val: number
}

export type StringValue = {
  val: string
}

export type ColorValue = {
  rgb: string
}

export type Font = {
  sz: NumberValue
  name: StringValue
  b: '' | null
  i: '' | null
  u: '' | null
  color: ColorValue | null
}

export type FontsAttributes = {
  knownFonts: 1
}

export type PatternFill = {
  patternType: 'none'
  bgColor: ''
}

export type Fill = {
  patternFill: PatternFill
}

export type Border = {
  left: ''
  right: ''
  top: ''
  bottom: ''
  diagonal: ''
}

export type Alignment = {
  indent: number | null
  vertical: 'center'
  wrapText: true
}

export type CellFormat = {
  applyAlignment: 1 | null
  applyFont: 1 | null
  applyNumberFormat: 1 | null
  borderId: number
  fillId: number
  fontId: number
  numFmtId: number
  xfId: number | null
  alignment: Alignment | null
}

export type CellStyle = {
  builtinId: number
  name: string
  xfId: number
}

export type TableStyle = {
  name: string
}

export type TableStylesAttributes = {
  defaultPivotStyle: 'PivotStyleMedium9'
  defaultTableStyle: 'TableStyleMedium9'
}

export type StyleSheet = {
  numFmts: StyleSheetArray<NumberFormat>
  fonts: StyleSheetArray<Font> & FontsAttributes
  fills: StyleSheetArray<Fill>
  borders: StyleSheetArray<Border>
  cellStyleXfs: StyleSheetArray<CellFormat>
  cellXfs: StyleSheetArray<CellFormat>
  cellStyles: StyleSheetArray<CellStyle>
  dxfs: StyleSheetArray<CellFormat>
  tableStyles: StyleSheetArray<TableStyle> & TableStylesAttributes
}

function getArrayBuilder<T extends DeepSimpleObject>(desc: Descriptor<T, XmlMeta>, localName: string) {
  return Descriptor.create<StyleSheetArray<T>, XmlMeta>({})
    .numberNull('count', { attribute: true })
    .objectArray('values', desc, { value: true, localName })
    .get()
}

export const NUMBER_FORMAT_SCHEMA = Descriptor.create<NumberFormat, XmlMeta>({})
  .string('formatCode', { attribute: true })
  .number('numFmtId', { attribute: true })
  .get()

export const FONT_SCHEMA = Descriptor.create<Font, XmlMeta>({})
  .object('sz', Descriptor.create<NumberValue, XmlMeta>({}).numberNull('val', { attribute: true }).get())
  .object('name', Descriptor.create<StringValue, XmlMeta>({}).stringNull('val', { attribute: true }).get())
  .stringNull('b')
  .stringNull('i')
  .stringNull('u')
  .objectNull('color', Descriptor.create<ColorValue, XmlMeta>({}).stringNull('rgb', { attribute: true }).get())
  .get()

export const FONTS_SCHEMA = Descriptor.create<StyleSheetArray<Font> & FontsAttributes, XmlMeta>({})
  .numberNull('count', { attribute: true })
  .numberNull('knownFonts', { attribute: true, namespace: X14AC_NAMESPACE })
  .objectArray('values', FONT_SCHEMA, { value: true, localName: 'font' })
  .get()

export const PATTERN_FILL_SCHEMA = Descriptor.create<PatternFill, XmlMeta>({})
  .string('patternType', { attribute: true })
  .stringNull('bgColor')
  .get()

export const FILL_SCHEMA = Descriptor.create<Fill, XmlMeta>({}).object('patternFill', PATTERN_FILL_SCHEMA).get()

export const BORDER_SCHEMA = Descriptor.create<Border, XmlMeta>({})
  .string('left')
  .string('right')
  .string('top')
  .string('bottom')
  .string('diagonal')
  .get()

export const ALIGNMENT_SCHEMA = Descriptor.create<Alignment, XmlMeta>({})
  .numberNull('indent', { attribute: true })
  .string('vertical', { attribute: true })
  .boolean('wrapText', { attribute: true })
  .get()

export const CELL_FORMAT_SCHEMA = Descriptor.create<CellFormat, XmlMeta>({})
  .numberNull('applyAlignment', { attribute: true })
  .numberNull('applyFont', { attribute: true })
  .numberNull('applyNumberFormat', { attribute: true })
  .number('borderId', { attribute: true })
  .number('fillId', { attribute: true })
  .number('fontId', { attribute: true })
  .number('numFmtId', { attribute: true })
  .numberNull('xfId', { attribute: true })
  .objectNull('alignment', ALIGNMENT_SCHEMA)
  .get()

export const CELL_STYLE_SCHEMA = Descriptor.create<CellStyle, XmlMeta>({})
  .number('builtinId', { attribute: true })
  .string('name', { attribute: true })
  .number('xfId', { attribute: true })
  .get()

export const TABLE_STYLE_SCHEMA = Descriptor.create<TableStyle, XmlMeta>({}).string('name', { attribute: true }).get()

export const TABLE_STYLES_SCHEMA = Descriptor.create<StyleSheetArray<TableStyle> & TableStylesAttributes, XmlMeta>({})
  .numberNull('count', { attribute: true })
  .string('defaultPivotStyle', { attribute: true })
  .string('defaultTableStyle', { attribute: true })
  .objectArray('values', TABLE_STYLE_SCHEMA, { value: true, localName: 'tableStyle' })
  .get()

export const STYLE_SHEET_SCHEMA = Descriptor.create<StyleSheet, XmlMeta>({})
  .meta({
    standalone: 'yes',
    name: 'styleSheet',
    namespace: MAIN_NAMESPACE,
    namespaces: [
      {
        prefix: 'mc',
        uri: MARKUP_COMPATIBILITY_NAMESPACE,
      },
      {
        prefix: 'x14ac',
        uri: X14AC_NAMESPACE,
      },
    ],
    attributes: [
      {
        namespace: MARKUP_COMPATIBILITY_NAMESPACE,
        name: 'Ignorable',
        value: 'x14ac',
      },
    ],
  })
  .object('numFmts', getArrayBuilder(NUMBER_FORMAT_SCHEMA, 'numFmt'))
  .object('fonts', FONTS_SCHEMA)
  .object('fills', getArrayBuilder(FILL_SCHEMA, 'fill'))
  .object('borders', getArrayBuilder(BORDER_SCHEMA, 'border'))
  .object('cellStyleXfs', getArrayBuilder(CELL_FORMAT_SCHEMA, 'xf'))
  .object('cellXfs', getArrayBuilder(CELL_FORMAT_SCHEMA, 'xf'))
  .object('cellStyles', getArrayBuilder(CELL_STYLE_SCHEMA, 'cellStyle'))
  .object('dxfs', getArrayBuilder(CELL_FORMAT_SCHEMA, 'xf'))
  .object('tableStyles', TABLE_STYLES_SCHEMA)
  .get()
