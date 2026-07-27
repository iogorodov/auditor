import type { Alignment, CellFormat, StyleSheet, StyleSheetArray } from './xlsx-style-types'

export type Style = {
  font: 'normal' | 'bold' | 'link' | 'gray'
  format: 'general' | 'integer' | 'float' | 'percent' | 'date' | 'date-time'
  indent: number
  wrapText: boolean
}

function equals(s1: Style, s2: Style): boolean {
  return s1.font === s2.font && s1.format === s2.format && s1.indent === s2.indent && s1.wrapText === s2.wrapText
}

function buildArray<T>(values: T[], skipCount?: true): StyleSheetArray<T>
function buildArray<T, Add>(values: T[], add: Add, skipCount?: true): StyleSheetArray<T> & Add
function buildArray<T, Add>(values: T[], add?: Add | true, skipCount?: true): StyleSheetArray<T> & Add {
  if (add === undefined) {
    return {
      count: values.length,
      values,
    } as StyleSheetArray<T> & Add
  }
  if (add === true) {
    return {
      count: null,
      values,
    } as StyleSheetArray<T> & Add
  }

  return {
    ...add,
    count: skipCount ? null : values.length,
    values,
  }
}

function getFontId(font: Style['font']): number {
  switch (font) {
    case 'normal':
      return 0
    case 'bold':
      return 1
    case 'link':
      return 2
    case 'gray':
      return 3
  }
}

function getNumberFormatId(format: Style['format']): number {
  switch (format) {
    case 'general':
      return 0
    case 'integer':
      return 1
    case 'float':
      return 167
    case 'percent':
      return 9
    case 'date':
      return 165
    case 'date-time':
      return 166
  }
}

function getAlignment(style: { indent: number; wrapText: boolean }): Alignment | null {
  if (style.indent === 0 && !style.wrapText) return null
  return {
    indent: style.indent || null,
    vertical: 'center',
    wrapText: true,
  }
}

function convertStyle(style: Style): CellFormat {
  const fontId = getFontId(style.font)
  const numFmtId = getNumberFormatId(style.format)
  const alignment = getAlignment(style)
  return {
    applyAlignment: alignment ? 1 : null,
    applyFont: fontId ? 1 : null,
    applyNumberFormat: numFmtId ? 1 : null,
    borderId: 0,
    fillId: 0,
    fontId,
    numFmtId,
    xfId: 0,
    alignment,
  }
}

export class StylesCollector {
  private readonly styles: Style[] = []

  getStyleIndex(style: Style): number {
    const result = this.styles.findIndex(it => equals(it, style))
    if (result >= 0) return result

    return this.styles.push(style) - 1
  }

  getStyleSheet(): StyleSheet {
    return {
      numFmts: buildArray([
        {
          formatCode: 'yyyy-mm-dd',
          numFmtId: 165,
        },
        {
          formatCode: 'yyyy-mm-dd HH:MM',
          numFmtId: 166,
        },
        {
          formatCode: '0.0#',
          numFmtId: 167,
        },
      ]),

      fonts: buildArray(
        [
          {
            sz: { val: 12 },
            name: { val: 'Calibri' },
            b: null,
            i: null,
            u: null,
            color: null,
          },
          {
            sz: { val: 12 },
            name: { val: 'Calibri' },
            b: '',
            i: null,
            u: null,
            color: null,
          },
          {
            sz: { val: 12 },
            name: { val: 'Calibri' },
            b: null,
            i: null,
            u: '',
            color: { rgb: 'FF0000FF' },
          },
          {
            sz: { val: 12 },
            name: { val: 'Calibri' },
            b: null,
            i: '',
            u: null,
            color: { rgb: 'FF808080' },
          },
        ],
        {
          knownFonts: 1,
        },
      ),

      fills: buildArray([
        {
          patternFill: {
            patternType: 'none',
            bgColor: '',
          },
        },
      ]),

      borders: buildArray([
        {
          left: '',
          right: '',
          top: '',
          bottom: '',
          diagonal: '',
        },
      ]),

      cellStyleXfs: buildArray(
        [
          {
            applyAlignment: null,
            applyFont: null,
            applyNumberFormat: null,
            borderId: 0,
            fillId: 0,
            fontId: 0,
            numFmtId: 0,
            xfId: null,
            alignment: null,
          },
        ],
        true,
      ),

      cellXfs: buildArray(this.styles.map(convertStyle)),

      cellStyles: buildArray(
        [
          {
            builtinId: 0,
            name: 'Normal',
            xfId: 0,
          },
        ],
        true,
      ),

      dxfs: buildArray([]),

      tableStyles: buildArray([], {
        defaultPivotStyle: 'PivotStyleMedium9',
        defaultTableStyle: 'TableStyleMedium9',
      }),
    }
  }
}
