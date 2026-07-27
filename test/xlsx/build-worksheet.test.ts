import { describe, expect, test } from 'bun:test'
import { CellType, type Worksheet } from '../../src/xlsx/xlsx'
import { StylesCollector } from '../../src/xlsx/styles-collector'
import { buildWorksheet } from '../../src/xlsx/xlsx-build'

describe('buildWorksheet', () => {
  test('Build worksheet with headers and data', () => {
    const src: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'Header' }]],
      data: [[{ value: 'Value' }]],
    }

    const styles = new StylesCollector()

    const { data } = buildWorksheet(src, styles)

    expect(data.sheetData.length).toBe(2)

    expect(data.sheetData[0].c[0].v).toBe('Header')
    expect(data.sheetData[1].c[0].v).toBe('Value')
  })

  test('Build correct worksheet dimension', () => {
    const src: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }, { type: CellType.TEXT }],
      headers: [[{ value: 'A' }, { value: 'B' }]],
      data: [[{ value: '1' }, { value: '2' }]],
    }

    const styles = new StylesCollector()
    const { data } = buildWorksheet(src, styles)

    expect(data.dimension.ref.from).toEqual({ row: 1, col: 1 })
    expect(data.dimension.ref.to).toEqual({ row: 2, col: 2 })
  })

  test('Dimension works when no rows exist', () => {
    const src: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }],
      headers: [],
      data: [],
    }

    const styles = new StylesCollector()
    const { data } = buildWorksheet(src, styles)

    expect(data.dimension.ref.from).toEqual({ row: 1, col: 1 })
    expect(data.dimension.ref.to).toEqual({ row: 1, col: 1 })
  })

  test('Add hyperlinks and relationships', () => {
    const src: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'Link', href: 'https://example.com' }]],
      data: [],
    }

    const styles = new StylesCollector()

    const { data, rels } = buildWorksheet(src, styles)

    expect(data.hyperlinks?.length).toBe(1)
    expect(rels?.relationships.length).toBe(1)
    expect(rels?.relationships[0].target).toBe('https://example.com')
  })

  test('Create frozen panes when freeze option provided', () => {
    const src: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'H' }]],
      data: [[{ value: 'D' }]],
      freeze: { row: 1, col: 1 },
    }

    const styles = new StylesCollector()
    const { data } = buildWorksheet(src, styles)

    expect(data.sheetViews).not.toBeNull()
    expect(data.sheetViews?.[0].pane.state).toBe('frozen')
  })

  test('Infer columns from first header row when columns are empty', () => {
    const src: Worksheet = {
      name: 'sheet',
      columns: [],
      headers: [[{ value: 'A' }, { value: 'B' }]],
      data: [],
    }

    const styles = new StylesCollector()
    const { data } = buildWorksheet(src, styles)

    expect(data.dimension.ref.to).toEqual({ row: 1, col: 2 })
    expect(data.cols?.length).toBe(2)
    expect(data.sheetData[0].c[0].v).toBe('A')
    expect(data.sheetData[0].c[1].v).toBe('B')
  })

  test('Use SHORT_STRING for missing column definitions', () => {
    const src: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'A' }, { value: 'B' }]],
      data: [[{ value: 'value-1' }, { value: 'value-2' }]],
    }

    const styles = new StylesCollector()
    const { data } = buildWorksheet(src, styles)

    expect(data.dimension.ref.to).toEqual({ row: 2, col: 2 })
    expect(data.cols?.length).toBe(2)
    expect(data.cols?.[1].width).toBe(10)
    expect(data.sheetData[1].c[1].v).toBe('value-2')
  })
})
