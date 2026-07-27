import { describe, expect, test } from 'bun:test'
import { unzipSync } from 'fflate'
import { buildXlsxFile, CellType, type Worksheet } from '../../src/xlsx/xlsx'

describe('Build XLSX file tests', () => {
  test('Generate XLSX file', async () => {
    const sheet: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'Foo' }]],
      data: [[{ value: 'Baz' }]],
    }

    return buildXlsxFile([sheet])
    // .then(xlsx => Bun.file('test.xlsx').write(xlsx))
  })

  test('Generate XLSX file with two sheets', async () => {
    const summary: Worksheet = {
      name: 'Summary',
      columns: [],
      headers: [
        [
          {
            value: 'User',
          },
          {
            value: 'Total',
          },
          {
            value: 'Apr 1 - 5',
          },
          {
            value: 'Apr 6 - 12',
          },
          {
            value: 'Apr 13 - 19',
          },
          {
            value: 'Apr 20 - 26',
          },
          {
            value: 'Apr 27 - 30',
          },
        ],
      ],
      data: [],
      freeze: {
        col: 1,
        row: 1,
      },
    }

    const breakdown: Worksheet = {
      name: 'Breakdown',
      columns: [
        {
          type: CellType.LONG_STRING,
        },
        {
          type: CellType.SHORT_STRING,
        },
        {
          type: CellType.SHORT_STRING,
        },
        {
          type: CellType.SHORT_STRING,
        },
        {
          type: CellType.TEXT,
        },
        {
          type: CellType.LONG_STRING,
        },
        {
          type: CellType.LONG_STRING,
        },
        {
          type: CellType.TEXT,
        },
      ],
      headers: [
        [
          {
            value: 'Worklog by',
          },
          {
            value: 'Priority',
          },
          {
            value: 'Issue Type',
          },
          {
            value: 'Issue',
          },
          {
            value: 'Summary',
          },
          {
            value: 'Worklog Date',
          },
          {
            value: 'Time Spent',
          },
          {
            value: 'Comment',
          },
        ],
      ],
      data: [],
      freeze: {
        col: 1,
        row: 1,
      },
    }

    return buildXlsxFile([summary, breakdown])
    // .then(xlsx => Bun.file('test.xlsx').write(xlsx))
  })

  test('Generate valid XLSX archive structure', async () => {
    const sheet: Worksheet = {
      name: 'sheet',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'Foo' }]],
      data: [[{ value: 'Bar' }]],
    }

    const xlsx = await buildXlsxFile([sheet])

    const files = unzipSync(xlsx)

    expect(files['[Content_Types].xml']).toBeDefined()
    expect(files['_rels/.rels']).toBeDefined()
    expect(files['xl/workbook.xml']).toBeDefined()
    expect(files['xl/styles.xml']).toBeDefined()
    expect(files['xl/sheet1.xml']).toBeDefined()
  })

  test('Generate multiple sheets', async () => {
    const sheet1: Worksheet = {
      name: 'sheet1',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'A' }]],
      data: [],
    }

    const sheet2: Worksheet = {
      name: 'sheet2',
      columns: [{ type: CellType.TEXT }],
      headers: [[{ value: 'B' }]],
      data: [],
    }

    const xlsx = await buildXlsxFile([sheet1, sheet2])

    const files = unzipSync(xlsx)

    expect(files['xl/sheet1.xml']).toBeDefined()
    expect(files['xl/sheet2.xml']).toBeDefined()
  })
})
