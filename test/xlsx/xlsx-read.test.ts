import { describe, expect, test } from 'bun:test'
import { buildXlsxFile, CellType, type Worksheet } from '../../src/xlsx/xlsx'
import { readXlsxSheets, XlsxReadError } from '../../src/xlsx/xlsx-read'
import { parseCatalogRows, parseHierarchyRows } from '../../src/core/sheets.ts'
import { validateCatalog } from '../../src/core/validate.ts'
import { catalogSheets } from '../fixtures.ts'

const loadFixture = catalogSheets

describe('readXlsxSheets — round-trip с нашим writer', () => {
  test('заголовок и данные возвращаются как строки, пропуски — пустыми', async () => {
    const sheet: Worksheet = {
      name: 'Лист & Ко',
      columns: [{ type: CellType.TEXT }, { type: CellType.TEXT }, { type: CellType.TEXT }],
      headers: [[{ value: 'A' }, { value: 'B' }, { value: 'C' }]],
      data: [
        [{ value: 'a1' }, null, { value: 'c1 <спец> & символы' }],
        [{ value: 'a2' }],
      ],
    }
    const sheets = readXlsxSheets(await buildXlsxFile([sheet]))
    expect(sheets.map(s => s.name)).toEqual(['Лист & Ко'])
    expect(sheets[0]!.rows).toEqual([
      ['A', 'B', 'C'],
      ['a1', '', 'c1 <спец> & символы'],
      ['a2'],
    ])
  })

  test('несколько листов в порядке книги', async () => {
    const make = (name: string, value: string): Worksheet => ({
      name,
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value }]],
      data: [],
    })
    const sheets = readXlsxSheets(await buildXlsxFile([make('S1', 'x'), make('S2', 'y')]))
    expect(sheets.map(s => `${s.name}:${s.rows[0]![0]}`)).toEqual(['S1:x', 'S2:y'])
  })

  test('не-xlsx данные -> XlsxReadError', () => {
    expect(() => readXlsxSheets(new TextEncoder().encode('не архив'))).toThrow(XlsxReadError)
  })
})

describe('readXlsxSheets — реальные файлы (Excel и Google Sheets)', () => {
  const excel = loadFixture('catalog.xlsx')
  const sheets = loadFixture('catalog-sheets.xlsx')

  const parse = (source: ReturnType<typeof loadFixture>) => ({
    hierarchy: parseHierarchyRows(source.find(s => s.name === 'Иерархия')!.rows),
    remarks: parseCatalogRows(source.find(s => s.name === 'Замечания')!.rows),
  })

  test('в обоих файлах найдены листы «Иерархия» и «Замечания»', () => {
    for (const source of [excel, sheets]) {
      const names = source.map(s => s.name).sort()
      expect(names).toEqual(['Замечания', 'Иерархия'])
    }
  })

  test('каталог из Excel-файла: структура и бинарная валидация', () => {
    const { hierarchy, remarks } = parse(excel)
    expect(hierarchy.level1.map(s => `${s.name}:${s.type}`)).toEqual([
      'Документация:fixed',
      'Общее:fixed',
      'Помещение:variable',
    ])
    expect(remarks.length).toBeGreaterThan(0)
    expect(validateCatalog(hierarchy, remarks)).toEqual([])
  })

  test('перенос строки внутри ячейки Excel нормализуется в пробел', () => {
    const { remarks } = parse(excel)
    const remark = remarks.find(r => r.text.includes('шкаф'))
    expect(remark).toBeDefined()
    expect(remark!.text).not.toInclude('\n')
    expect(remark!.text).toBe('Переставить шкаф левее, потом правее и обратно')
  })

  test('Excel и Google Sheets дают идентичный каталог', () => {
    expect(parse(excel)).toEqual(parse(sheets))
  })
})
