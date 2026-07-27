import { describe, expect, test } from 'bun:test'
import {
  CONTENT_TYPES_SCHEMA,
  ContentType,
  type ContentTypes,
  formatRef,
  RELATIONSHIPS_SCHEMA,
  type Relationships,
  RelationshipType,
  WORKBOOK_SCHEMA,
  WORKSHEET_SCHEMA,
  type Workbook,
  type Worksheet,
} from '../../src/xlsx/xlsx-types'
import { write } from '../../src/xlsx/serialize'
import { XmlWriter } from '../../src/xlsx/xml'

function inlineXml(xml: string): string {
  return xml
    .replace(/\s*\n\s*/g, ' ')
    .replace(/>\s*</gm, '><')
    .replace(/\s+\/>/g, '/>')
    .trim()
}

describe('Generate XML for XLSX objects tests', () => {
  test('Convert Ref to string', () => {
    expect(formatRef({ row: 0, col: 0 })).toBe('0')
    expect(formatRef({ row: 1, col: 1 })).toBe('A1')
    expect(formatRef({ row: 2, col: 2 })).toBe('B2')
    expect(formatRef({ row: 1, col: 26 })).toBe('Z1')
    expect(formatRef({ row: 1, col: 27 })).toBe('AA1')
    expect(formatRef({ row: 1, col: 28 })).toBe('AB1')
    expect(formatRef({ row: 12345, col: 29 })).toBe('AC12345')
  })

  test('Serialize empty content types', () => {
    const data: ContentTypes = {
      defaults: [],
      overrides: [],
    }

    const w = write(data, CONTENT_TYPES_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>
      `),
    )
  })

  test('Serialize content types with single default', () => {
    const data: ContentTypes = {
      defaults: [
        {
          contentType: ContentType.XML,
          extension: 'xml',
        },
      ],
      overrides: [],
    }

    const w = write(data, CONTENT_TYPES_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default ContentType="application/xml" Extension="xml"/>
        </Types>
      `),
    )
  })

  test('Serialize content types with two defaults', () => {
    const data: ContentTypes = {
      defaults: [
        {
          contentType: ContentType.XML,
          extension: 'xml',
        },
        {
          contentType: ContentType.RELATIONSHIPS,
          extension: 'rels',
        },
      ],
      overrides: [],
    }

    const w = write(data, CONTENT_TYPES_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default ContentType="application/xml" Extension="xml"/>
          <Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/>
        </Types>
      `),
    )
  })

  test('Serialize content types with single override', () => {
    const data: ContentTypes = {
      defaults: [],
      overrides: [
        {
          contentType: ContentType.WORKBOOK,
          partName: '/xl/workbook.xml',
        },
      ],
    }

    const w = write(data, CONTENT_TYPES_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Override
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
            PartName="/xl/workbook.xml"
          />
        </Types>
      `),
    )
  })

  test('Serialize content types with defaults and overrides', () => {
    const data: ContentTypes = {
      defaults: [
        {
          contentType: ContentType.XML,
          extension: 'xml',
        },
        {
          contentType: ContentType.RELATIONSHIPS,
          extension: 'rels',
        },
      ],
      overrides: [
        {
          contentType: ContentType.WORKBOOK,
          partName: '/xl/workbook.xml',
        },
      ],
    }

    const w = write(data, CONTENT_TYPES_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default ContentType="application/xml" Extension="xml"/>
          <Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/>
          <Override
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
            PartName="/xl/workbook.xml"
          />
        </Types>
      `),
    )
  })

  test('Serialize relationships', () => {
    const data: Relationships = {
      relationships: [
        {
          id: { id: 1 },
          target: 'xl/workbook.xml',
          type: RelationshipType.WORKBOOK,
          targetMode: null,
        },
      ],
    }

    const w = write(data, RELATIONSHIPS_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship
            Id="rId1"
            Target="xl/workbook.xml"
            Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
          />
       </Relationships>
      `),
    )
  })

  test('Serialize relationships with TargetMode', () => {
    const data: Relationships = {
      relationships: [
        {
          id: { id: 1 },
          target: 'http://localhost:2990/jira/browse/TEST-1',
          type: RelationshipType.HYPERLINK,
          targetMode: 'External',
        },
        {
          id: { id: 2 },
          target: 'http://localhost:2990/jira/browse/TEST-2',
          type: RelationshipType.HYPERLINK,
          targetMode: 'External',
        },
      ],
    }

    const w = write(data, RELATIONSHIPS_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship
            Id="rId1"
            Target="http://localhost:2990/jira/browse/TEST-1"
            TargetMode="External"
            Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
          />
          <Relationship
            Id="rId2"
            Target="http://localhost:2990/jira/browse/TEST-2"
            TargetMode="External"
            Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
          />
        </Relationships>
      `),
    )
  })

  test('Serialize workbook', () => {
    const data: Workbook = {
      workbookPr: { date1904: false },
      sheets: [
        {
          name: 'Foo',
          id: { id: 1 },
          sheetId: 1,
        },
      ],
    }

    const w = write(data, WORKBOOK_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook
          xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" 
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <workbookPr date1904="false"/>
          <sheets>
            <sheet name="Foo" r:id="rId1" sheetId="1"/>
          </sheets>
        </workbook>
      `),
    )
  })

  test('Serialize worksheet', () => {
    const data: Worksheet = {
      dimension: { ref: { from: { row: 1, col: 1 }, to: { row: 9, col: 9 } } },
      sheetViews: null,
      cols: null,
      sheetData: [
        {
          r: 1,
          c: [
            {
              r: { row: 1, col: 1 },
              s: 1,
              t: 'str',
              v: 'foo',
            },
            {
              r: { row: 1, col: 3 },
              s: 2,
              t: 'str',
              v: 'bar',
            },
          ],
        },
        {
          r: 2,
          c: [
            {
              r: { row: 2, col: 1 },
              s: 1,
              t: 'str',
              v: 'FOO',
            },
            {
              r: { row: 2, col: 3 },
              s: 2,
              t: 'str',
              v: 'BAR',
            },
            {
              r: { row: 2, col: 5 },
              s: 2,
              t: null,
              v: '1',
            },
          ],
        },
      ],
      hyperlinks: null,
    }

    const w = write(data, WORKSHEET_SCHEMA, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe(
      inlineXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <worksheet
          xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <dimension ref="A1:I9"/>
          <sheetData>
            <row r="1">
              <c r="A1" s="1" t="str">
                  <v>foo</v>
              </c>
              <c r="C1" s="2" t="str">
                  <v>bar</v>
              </c>
            </row>
            <row r="2">
              <c r="A2" s="1" t="str">
                  <v>FOO</v>
              </c>
              <c r="C2" s="2" t="str">
                  <v>BAR</v>
              </c>
              <c r="E2" s="2">
                  <v>1</v>
              </c>
            </row>
          </sheetData>
        </worksheet>
      `),
    )
  })
})
